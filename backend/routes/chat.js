const express = require("express");
const pool = require("../db");
const authenticateToken = require("../middleware/auth");
const {
  generateChatResponse,
  extractWeatherIntent,
} = require("../services/longcat");

const router = express.Router();

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const WEATHER_PATTERN =
  /\b(weather|temperature|forecast|rain|raining|rainy|humidity|wind|snow|sunny|cloudy|conditions|hot|cold|precipitation|umbrella)\b/i;

const FORECAST_PATTERN =
  /\b(forecast|rain|raining|rainy|precipitation|tomorrow|today|tonight|afternoon|evening|morning|next week|this week|will it rain)\b/i;

const INVALID_CITY_NAMES = new Set([
  "today",
  "tomorrow",
  "tonight",
  "now",
  "currently",
  "forecast",
  "weather",
  "rain",
  "raining",
  "rainy",
  "this week",
  "next week",
  "morning",
  "afternoon",
  "evening",
]);

function isValidCityInput(value) {
  return (
    typeof value === "string" &&
    value.trim().length > 0 &&
    value.trim().length <= 100 &&
    !INVALID_CITY_NAMES.has(value.trim().toLowerCase())
  );
}

function extractCity(message) {
  const text = message.trim();

  const timeWords =
    /\b(today|tomorrow|tonight|now|currently|right now|this week|next week|this morning|this afternoon|this evening|in the morning|in the afternoon|in the evening|after\s+\d+\s+(?:minutes?|hours?|days?)|in\s+\d+\s+(?:minutes?|hours?|days?))\b/gi;

  const cleanedMessage = text
    .replace(timeWords, " ")
    .replace(/\s+/g, " ")
    .trim();

  const patterns = [
    /\b(?:weather|temperature|forecast|rain|raining|humidity|wind|snow|sunny|cloudy|conditions)\s+(?:in|for|at)\s+([a-zA-Z][a-zA-Z\s-]{0,60}?)(?=\s+[?!.,]|[?!.,]|$)/i,
    /\b(?:in|for)\s+([a-zA-Z][a-zA-Z\s-]{0,60}?)\s+(?:weather|forecast|temperature)\b/i,
  ];

  for (const pattern of patterns) {
    const match = cleanedMessage.match(pattern);

    if (match) {
      const city = match[1].trim().replace(/\s+/g, " ");

      if (
        !/^(today|tomorrow|tonight|now|currently|right now|this week|next week)$/i.test(
          city,
        )
      ) {
        return city;
      }
    }
  }

  return null;
}

function resolveRelativeTargetTimestamp(relativeTime) {
  if (typeof relativeTime !== "string" || !relativeTime.trim()) {
    return null;
  }

  const match = relativeTime.match(
    /\b(?:in|after)\s+(\d+(?:\.\d+)?)\s+(minutes?|hours?|days?)\b/i,
  );

  if (!match) return null;

  const amount = Number(match[1]);
  const unit = match[2].toLowerCase();

  if (!Number.isFinite(amount) || amount <= 0) return null;

  const multiplier = unit.startsWith("minute")
    ? 60_000
    : unit.startsWith("hour")
      ? 3_600_000
      : 86_400_000;

  return Date.now() + amount * multiplier;
}

function selectNearestForecastEntry(forecastEntries, targetTimestamp) {
  if (!Array.isArray(forecastEntries) || forecastEntries.length === 0) {
    return null;
  }

  const MAX_DISTANCE_MS = 3 * 60 * 60 * 1000;
  let nearestEntry = null;
  let nearestDistance = Infinity;

  for (const entry of forecastEntries) {
    const timestamp = Number(entry.timestampUTC) * 1000;

    if (!Number.isFinite(timestamp)) continue;

    const distance = Math.abs(timestamp - targetTimestamp);

    if (distance < nearestDistance) {
      nearestDistance = distance;
      nearestEntry = entry;
    }
  }

  return nearestDistance <= MAX_DISTANCE_MS ? nearestEntry : null;
}

function formatPakistanTime(unixTimestamp) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Karachi",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(new Date(unixTimestamp * 1000));
}

function getPakistanDate(offsetDays = 0) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Karachi",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());

  const values = Object.fromEntries(
    parts.map(({ type, value }) => [type, value]),
  );

  const date = new Date(
    Date.UTC(
      Number(values.year),
      Number(values.month) - 1,
      Number(values.day) + offsetDays,
    ),
  );

  return date.toISOString().slice(0, 10);
}

function getDailyRainSummary(forecastEntries, targetDate) {
  const dayEntries = forecastEntries.filter((entry) => {
    // dateTimePKT is formatted as YYYY-MM-DD, HH:mm.
    const entryDate = entry.dateTimePKT.slice(0, 10);
    return entryDate === targetDate;
  });

  if (dayEntries.length === 0) {
    return {
      date: targetDate,
      available: false,
      message: "No forecast entries are available for this date.",
    };
  }

  const validProbabilities = dayEntries
    .map((entry) => entry.rainProbability)
    .filter(
      (probability) =>
        typeof probability === "number" && Number.isFinite(probability),
    );

  return {
    date: targetDate,
    available: true,
    intervalsAvailable: dayEntries.length,
    intervalsWithRainProbability: validProbabilities.length,
    peakRainProbability:
      validProbabilities.length > 0 ? Math.max(...validProbabilities) : null,
    intervals: dayEntries.map((entry) => ({
      timePKT: entry.dateTimePKT,
      rainProbability: entry.rainProbability,
      description: entry.description,
    })),
    interpretation:
      "Peak probability is the highest individual forecast-interval probability, not the probability of rain at any time during the entire day.",
  };
}

function getForecastEntriesForPeriod(forecastEntries, targetDate, period) {
  const timeRanges = {
    morning: { start: 6, end: 12 },
    afternoon: { start: 12, end: 17 },
    evening: { start: 17, end: 21 },
  };

  const selectedPeriod = period.toLowerCase();

  if (selectedPeriod === "night") {
    const nextDate = new Date(`${targetDate}T12:00:00Z`);
    nextDate.setUTCDate(nextDate.getUTCDate() + 1);
    const followingDate = nextDate.toISOString().slice(0, 10);

    return forecastEntries.filter((entry) => {
      const [date, time] = entry.dateTimePKT.split(", ");
      const hour = Number(time?.split(":")[0]);

      return (
        (date === targetDate && hour >= 21 && hour <= 23) ||
        (date === followingDate && hour >= 0 && hour < 6)
      );
    });
  }

  const range = timeRanges[selectedPeriod];

  if (!range) {
    return [];
  }

  return forecastEntries.filter((entry) => {
    const [date, time] = entry.dateTimePKT.split(", ");
    const hour = Number(time?.split(":")[0]);

    return date === targetDate && hour >= range.start && hour < range.end;
  });
}

async function getWeatherData(city, forecast = false) {
  const apiKey = process.env.OPENWEATHER_API_KEY;

  if (!apiKey) {
    const error = new Error("Weather API is not configured.");
    error.status = 502;
    throw error;
  }

  const endpoint = forecast ? "forecast" : "weather";

  const params = new URLSearchParams({
    q: city,
    appid: apiKey,
    units: "metric",
  });

  console.log("[Weather debug]", {
    city,
    forecast,
    endpoint,
  });

  const response = await fetch(
    `https://api.openweathermap.org/data/2.5/${endpoint}?${params}`,
  );

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    console.log("[OpenWeather error]", {
      status: response.status,
      response: data,
    });
    if (response.status === 404) {
      const error = new Error("City not found. Please check the city name.");
      error.status = 404;
      throw error;
    }

    if (response.status === 401) {
      const error = new Error("Weather provider rejected the API key.");
      error.status = 502;
      throw error;
    }

    const error = new Error("Unable to retrieve weather data.");
    error.status = 502;
    throw error;
  }

  if (forecast) {
    const forecastEntries = data.list.map((item) => {
      const pop =
        typeof item.pop === "number" && Number.isFinite(item.pop)
          ? Math.min(1, Math.max(0, item.pop))
          : null;

      return {
        timestampUTC: item.dt,
        dateTimeUTC: item.dt_txt,
        dateTimePKT: formatPakistanTime(item.dt),

        temperatureC: item.main.temp,
        feelsLikeC: item.main.feels_like,
        humidity: item.main.humidity,
        description: item.weather?.[0]?.description ?? "Unavailable",
        windSpeedMps: item.wind.speed,

        rainProbability: pop === null ? null : Math.round(pop * 100),
      };
    });

    const availableDates = [
      ...new Set(
        forecastEntries.map((entry) => entry.dateTimePKT.slice(0, 10)),
      ),
    ];

    const dailyRainSummaries = availableDates.map((date) =>
      getDailyRainSummary(forecastEntries, date),
    );

    return {
      type: "forecast",
      city: data.city.name,
      country: data.city.country,
      timezone: "Asia/Karachi",
      forecast: forecastEntries,
      dailyRainSummaries,
    };
  }

  return {
    type: "current",
    city: data.name,
    country: data.sys.country,
    timezone: "Asia/Karachi",
    temperatureC: data.main.temp,
    feelsLikeC: data.main.feels_like,
    humidity: data.main.humidity,
    description: data.weather[0].description,
    windSpeedMps: data.wind.speed,
    updatedAtUTC: new Date(data.dt * 1000).toISOString(),
    updatedAtPKT: formatPakistanTime(data.dt),
  };
}

// POST /api/chat
router.post("/", authenticateToken, async (req, res) => {
  try {
    const { message, city, forecast, conversationId } = req.body;

    if (
      typeof message !== "string" ||
      !message.trim() ||
      message.trim().length > 2000
    ) {
      return res.status(400).json({
        success: false,
        message: "Please provide a message of up to 2000 characters.",
      });
    }
    if (forecast !== undefined && typeof forecast !== "boolean") {
      return res.status(400).json({
        success: false,
        message: "The forecast field must be true or false.",
      });
    }
    if (
      conversationId !== undefined &&
      (typeof conversationId !== "string" || !UUID_PATTERN.test(conversationId))
    ) {
      return res
        .status(400)
        .json({ success: false, message: "Invalid conversation ID." });
    }

    const userMessage = message.trim();
    let activeConversationId = conversationId || null;
    let history = [];

    if (activeConversationId) {
      const existing = await pool.query(
        "SELECT id FROM conversations WHERE id = $1 AND user_id = $2",
        [activeConversationId, req.user.id],
      );
      if (existing.rowCount === 0) {
        return res
          .status(404)
          .json({ success: false, message: "Conversation not found." });
      }
      const historyResult = await pool.query(
        `SELECT role, content FROM messages
         WHERE conversation_id = $1
         ORDER BY created_at DESC, id DESC LIMIT 20`,
        [activeConversationId],
      );
      history = historyResult.rows.reverse();
    }

    const lastAssistantMessage =
      [...history].reverse().find((item) => item.role === "assistant")
        ?.content || "";
    const pendingCityQuestion =
      /which city|what city|city would you like|please (?:mention|provide) a city|which location/i.test(
        lastAssistantMessage,
      );

    // Recover the last known city from user requests and assistant answers.
    // We deliberately inspect both roles because a user may have replied with
    // a city name alone, and the assistant may have confirmed the resolved city.
    let previousCity = null;
    for (let i = history.length - 1; i >= 0; i--) {
      const item = history[i];
      let inferredCity = extractCity(item.content || "");
      if (!inferredCity && item.role === "assistant") {
        const match = String(item.content || "").match(
          /(?:weather|forecast)\s+(?:in|for|at)\s+([A-Z][A-Za-z-]*(?:\s+[A-Z][A-Za-z-]*)?)/i,
        );
        if (match) inferredCity = match[1].trim();
      }
      if (inferredCity && isValidCityInput(inferredCity)) {
        previousCity = inferredCity;
        break;
      }
      if (
        item.role === "user" &&
        /^[a-zA-Z][a-zA-Z\s-]{1,59}$/.test(String(item.content || "").trim()) &&
        pendingCityQuestion
      ) {
        previousCity = String(item.content).trim();
        break;
      }
    }

    const intent = await extractWeatherIntent(userMessage, {
      previousCity,
      pendingCityQuestion,
      history,
    });

    console.log("[Chat pipeline]", {
      userMessage,
      previousCity,
      pendingCityQuestion,
      intent,
    });

    // If the assistant had just asked for a city, interpret the user's reply
    // in that context (including replies that name more than one city).
    if (
      pendingCityQuestion &&
      (intent.cities?.length || isValidCityInput(userMessage))
    ) {
      intent.asksWeather = true;
      if (!intent.cities?.length) intent.cities = [userMessage];
      intent.city = intent.cities[0];
      if (/tomorrow/i.test(lastAssistantMessage)) {
        intent.date = intent.date || "tomorrow";
        intent.forecast = true;
      } else if (
        /forecast|rain|today|tonight|morning|afternoon|evening/i.test(
          lastAssistantMessage,
        )
      ) {
        intent.forecast = true;
      }
    }

    let weatherData = null;
    let answer = "";

    if (!intent.asksWeather) {
      answer =
        "I'm your BTP Weather Assistant. I can help with current weather, temperatures, rain chances, and forecasts. Which city would you like to check?";
    } else {
      let requestedCities = Array.isArray(intent.cities)
        ? intent.cities.filter(isValidCityInput)
        : [];
      if (requestedCities.length === 0 && isValidCityInput(intent.city))
        requestedCities = [intent.city.trim()];
      if (requestedCities.length === 0 && isValidCityInput(city))
        requestedCities = [city.trim()];
      if (requestedCities.length === 0 && isValidCityInput(previousCity))
        requestedCities = [previousCity];
      requestedCities = [
        ...new Map(
          requestedCities.map((name) => [name.toLowerCase(), name]),
        ).values(),
      ].slice(0, 3);

      if (requestedCities.length === 0) {
        const forecastContext = intent.forecast || forecast === true;
        answer = forecastContext
          ? "Which city would you like the forecast for? You can name up to three cities to compare."
          : "Which city would you like the weather for? You can name up to three cities to compare.";
      } else {
        const needsForecast = intent.forecast === true || forecast === true;
        const results = await Promise.allSettled(
          requestedCities.map(async (requestedCity) => {
            const data = await getWeatherData(requestedCity, needsForecast);
            data.requestedTime = intent.relativeTime;
            data.requestedDate = intent.date;
            data.requestedPeriod = intent.period;

            if (data.type === "forecast" && intent.relativeTime) {
              const targetTimestamp = resolveRelativeTargetTimestamp(
                intent.relativeTime,
              );
              if (targetTimestamp === null) {
                data.requestedForecastEntry = null;
                data.forecastSelectionNote =
                  "The requested relative time could not be resolved. Explain that the forecast time is unavailable; do not guess.";
              } else {
                data.requestedForecastEntry = selectNearestForecastEntry(
                  data.forecast,
                  targetTimestamp,
                );
                if (!data.requestedForecastEntry) {
                  data.forecastSelectionNote =
                    "No forecast entry is available close enough to the requested time. Explain this limitation clearly.";
                }
              }
            }

            if (data.type === "forecast" && intent.period) {
              const targetDate =
                intent.date === "tomorrow"
                  ? getPakistanDate(1)
                  : intent.date === "today"
                    ? getPakistanDate(0)
                    : getPakistanDate(0);
              data.requestedPeriodEntries = getForecastEntriesForPeriod(
                data.forecast,
                targetDate,
                intent.period,
              );
            }
            return data;
          }),
        );

        const successes = results
          .filter((item) => item.status === "fulfilled")
          .map((item) => item.value);
        const failures = results
          .filter((item) => item.status === "rejected")
          .map((item) => item.reason);

        if (successes.length === 0) {
          const firstError = failures[0];
          if (firstError?.status === 404) {
            answer = `I couldn't find ${requestedCities.join(", ")}. Please check the spelling or try a nearby city.`;
          } else {
            throw firstError || new Error("Unable to retrieve weather data.");
          }
        } else {
          weatherData = successes.length === 1 ? successes[0] : successes;
          const failureNote = failures.length
            ? `Some requested locations could not be retrieved: ${failures.map((e) => e.message).join("; ")}. Do not invent data for those locations.`
            : "";
          const systemMessage = `You are BTP Weather Assistant, a chatbot dedicated exclusively to weather.
Answer the latest weather question clearly and concisely. Use only the supplied weather data. Never invent measurements, dates, timestamps, city results, or rain probabilities.
Temperatures are in Celsius; wind speed is in metres per second. Rain probability is a forecast probability, not a guarantee.
For relative-time forecasts, if requestedForecastEntry exists, use only that entry and state its date/time using dateTimePKT. Explain it is an approximate match, not an exact hourly prediction. If unavailable, explain the limitation; never substitute an unrelated entry.
For date/period questions, use only entries for the requested date and period. If no relevant entries exist, say forecast coverage is unavailable. Forecast entries are approximately three hours apart; do not claim exact hourly predictions.
Never add rain probabilities. Do not interpret missing data as 0%. A 0% forecast does not guarantee rain is impossible.
Use dateTimePKT as Pakistan Standard Time (UTC+05:00); do not convert it again. Use conversation history to understand follow-ups, but use the supplied weather data for measurements.
${failureNote}
Weather data:
${JSON.stringify(weatherData)}`;

          answer = await generateChatResponse([
            { role: "system", content: systemMessage },
            ...history,
            { role: "user", content: userMessage },
          ]);
        }
      }
    }

    if (!activeConversationId) {
      const title =
        userMessage.length > 60
          ? `${userMessage.slice(0, 57)}...`
          : userMessage;
      const created = await pool.query(
        `INSERT INTO conversations (user_id, title) VALUES ($1, $2) RETURNING id`,
        [req.user.id, title],
      );
      activeConversationId = created.rows[0].id;
    }

    const dbClient = await pool.connect();
    try {
      await dbClient.query(
        `INSERT INTO messages (conversation_id, role, content, created_at)
   VALUES
     ($1, 'user', $2, clock_timestamp()),
     ($1, 'assistant', $3, clock_timestamp())`,
        [activeConversationId, userMessage, answer],
      );
      await dbClient.query(
        `UPDATE conversations SET updated_at = NOW() WHERE id = $1 AND user_id = $2`,
        [activeConversationId, req.user.id],
      );
      await dbClient.query("COMMIT");
    } catch (dbError) {
      await dbClient.query("ROLLBACK");
      throw dbError;
    } finally {
      dbClient.release();
    }

    return res.json({
      success: true,
      conversationId: activeConversationId,
      answer,
      weather: weatherData,
    });
  } catch (error) {
    console.error("Chat request failed:", error);
    if (error.status === 400 || error.status === 404) {
      return res
        .status(error.status)
        .json({ success: false, message: error.message });
    }
    return res.status(502).json({
      success: false,
      message: "The chatbot is temporarily unavailable. Please try again.",
    });
  }
});

// GET /api/chat/conversations
router.get("/conversations", authenticateToken, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT id, title, created_at, updated_at
       FROM conversations
       WHERE user_id = $1
       ORDER BY updated_at DESC
       LIMIT 50`,
      [req.user.id],
    );

    return res.json({
      success: true,
      conversations: result.rows,
    });
  } catch (error) {
    console.error("Conversation list failed:", error.message);

    return res.status(500).json({
      success: false,
      message: "Unable to retrieve conversations.",
    });
  }
});

// GET /api/chat/conversations/:id
router.get("/conversations/:id", authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;

    if (!UUID_PATTERN.test(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid conversation ID.",
      });
    }

    const conversationResult = await pool.query(
      `SELECT id, title, created_at, updated_at
       FROM conversations
       WHERE id = $1 AND user_id = $2`,
      [id, req.user.id],
    );

    if (conversationResult.rowCount === 0) {
      return res.status(404).json({
        success: false,
        message: "Conversation not found.",
      });
    }

    const messagesResult = await pool.query(
      `SELECT id, role, content, created_at
       FROM messages
       WHERE conversation_id = $1      
       ORDER BY
        created_at ASC,
        CASE role
          WHEN 'user' THEN 0
          WHEN 'assistant' THEN 1
          ELSE 2
        END ASC,
        id ASC
      `,
      [id],
    );

    return res.json({
      success: true,
      conversation: conversationResult.rows[0],
      messages: messagesResult.rows,
    });
  } catch (error) {
    console.error("Conversation retrieval failed:", error.message);

    return res.status(500).json({
      success: false,
      message: "Unable to retrieve conversation.",
    });
  }
});

module.exports = router;
