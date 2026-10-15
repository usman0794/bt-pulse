require("dotenv").config();
const OpenAI = require("openai");

const apiKey = process.env.LONGCAT_API_KEY;

if (!apiKey) {
  throw new Error("LONGCAT_API_KEY is missing from backend/.env");
}

const client = new OpenAI({
  apiKey,
  baseURL: process.env.LONGCAT_BASE_URL || "https://api.longcat.chat/openai",
});

const MODEL = process.env.LONGCAT_MODEL || "LongCat-2.0";

async function generateChatResponse(messages) {
  const response = await client.chat.completions.create({
    model: MODEL,
    messages,
    max_tokens: 900,
    temperature: 0.3,
  });

  const content = response.choices?.[0]?.message?.content;

  if (typeof content !== "string" || !content.trim()) {
    console.error("[Chat response] Empty response from Groq:", {
      finishReason: response.choices?.[0]?.finish_reason,
      usage: response.usage,
    });

    throw new Error("The AI provider returned an empty response.");
  }

  return content.trim();
}

function parseJsonObject(content) {
  const cleaned = String(content || "")
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/, "");

  try {
    return JSON.parse(cleaned);
  } catch {
    const start = cleaned.indexOf("{");
    const end = cleaned.lastIndexOf("}");
    if (start >= 0 && end > start) {
      return JSON.parse(cleaned.slice(start, end + 1));
    }
    throw new Error("The AI provider returned invalid intent JSON.");
  }
}

function normalizeCityList(parsed) {
  const raw = Array.isArray(parsed.cities)
    ? parsed.cities
    : typeof parsed.city === "string" && parsed.city.trim()
      ? [parsed.city]
      : [];

  const seen = new Set();
  return raw
    .filter((value) => typeof value === "string")
    .map((value) => value.trim().replace(/\s+/g, " "))
    .filter((value) => value.length > 0 && value.length <= 100)
    .filter((value) => {
      const key = value.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, 3);
}

/**
 * Classify a message for the weather-only assistant.
 * Backwards compatible with extractWeatherIntent(message, previousCity).
 * The second argument can also be a context object.
 */
async function extractWeatherIntent(message, previousCityOrContext = null) {
  if (typeof message !== "string" || !message.trim()) {
    throw new Error("A valid message is required to extract weather intent.");
  }

  const context =
    previousCityOrContext && typeof previousCityOrContext === "object"
      ? previousCityOrContext
      : { previousCity: previousCityOrContext };

  const previousCity =
    typeof context.previousCity === "string" && context.previousCity.trim()
      ? context.previousCity.trim()
      : null;
  const pendingCityQuestion = context.pendingCityQuestion === true;
  const recentHistory = Array.isArray(context.history)
    ? context.history.slice(-8).map((item) => ({
        role: item.role === "assistant" ? "assistant" : "user",
        content: String(item.content || "").slice(0, 1200),
      }))
    : [];

  const systemPrompt = `You are the intent parser for BTP Weather Assistant, which answers weather-related questions only.
Return exactly one JSON object with these fields:
{"asksWeather":false,"cities":[],"forecast":false,"relativeTime":null,"date":null,"period":null}

Rules:
- asksWeather=true for current weather, temperature, feels-like, rain, rain chance, humidity, wind, snow, clouds, conditions, and forecasts. Otherwise false.
- If pendingCityQuestion is true, the assistant previously asked the user to provide a city. Treat a short city-only reply (including multiple cities like "Jhang and Sialkot") as a weather response, and extract the city names.
- Understand follow-ups using recent conversation history, such as "what about tomorrow?", "will it rain there?", "and Karachi?".
- cities must be an array of city/location names, from 0 to 3 entries. Extract multiple cities when the user names more than one. Never include dates, times, durations, or weather words as cities.
- If no city is named, use previousCity only if it clearly applies to this weather follow-up; otherwise return an empty array.
- forecast=true for future weather, dates, tomorrow/today rain forecasts, named day periods, or relative durations. For current conditions only, forecast=false.
- relativeTime: normalize duration requests to "in 2 hours", "in 30 minutes", "in 1 day". Convert number words to digits and "after" to "in". Otherwise null. Do not turn tomorrow into a relative duration.
- date: "today" or "tomorrow" when requested, or YYYY-MM-DD only when an explicit date is unambiguous. Otherwise null.
- period: one of "morning", "afternoon", "evening", "night" when requested; "tonight" means "night". Otherwise null.
- Never invent city/date/time/duration. Do not interpret arithmetic or programming requests as weather.
- Output valid JSON only. No Markdown or explanation.`;

  const requestPayload = {
    message: message.trim(),
    previousCity,
    pendingCityQuestion,
    recentHistory,
  };

  const response = await client.chat.completions.create({
    model: MODEL,
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: JSON.stringify(requestPayload) },
    ],
    max_tokens: 350,
    temperature: 0,
  });

  const choice = response.choices?.[0];
  const content = choice?.message?.content;

  // Log the provider response when no usable text is returned.
  if (typeof content !== "string" || !content.trim()) {
    console.error("[Weather intent] Empty response from Groq:", {
      model: MODEL,
      finishReason: choice?.finish_reason,
      refusal: choice?.message?.refusal,
      usage: response.usage,
    });

    throw new Error(
      `Groq returned no intent text. Finish reason: ${
        choice?.finish_reason ?? "unknown"
      }`,
    );
  }

  let parsed;
  try {
    parsed = parseJsonObject(content);
  } catch (error) {
    console.error("[Weather intent] Invalid JSON returned by AI:", content);
    // A conservative fallback avoids turning malformed model JSON into a 502
    // for obvious weather messages. It never fabricates a city or measurements.
    const weatherLike =
      /\b(weather|temperature|forecast|rain|raining|humidity|wind|snow|cloudy|sunny|tomorrow|today|tonight)\b/i.test(
        message,
      );
    parsed = {
      asksWeather: pendingCityQuestion || weatherLike,
      cities: [],
      forecast:
        /\b(forecast|tomorrow|today|tonight|morning|afternoon|evening|after|in\s+\d+)\b/i.test(
          message,
        ),
      relativeTime: null,
      date: /\btomorrow\b/i.test(message)
        ? "tomorrow"
        : /\btoday\b/i.test(message)
          ? "today"
          : null,
      period: null,
    };
    if (!parsed.asksWeather && !pendingCityQuestion) {
      console.warn(
        "[Weather intent] Using conservative non-weather fallback.",
        error.message,
      );
    }
  }

  const cities = normalizeCityList(parsed);
  if (cities.length === 0 && previousCity && parsed.asksWeather === true) {
    cities.push(previousCity);
  }

  const validPeriods = new Set(["morning", "afternoon", "evening", "night"]);
  let relativeTime =
    typeof parsed.relativeTime === "string" && parsed.relativeTime.trim()
      ? parsed.relativeTime.trim().toLowerCase()
      : null;
  if (relativeTime) relativeTime = relativeTime.replace(/^after\s+/i, "in ");

  const period =
    typeof parsed.period === "string" &&
    validPeriods.has(parsed.period.toLowerCase())
      ? parsed.period.toLowerCase()
      : null;
  const date =
    typeof parsed.date === "string" && parsed.date.trim()
      ? parsed.date.trim().toLowerCase()
      : null;

  const result = {
    asksWeather:
      parsed.asksWeather === true || (pendingCityQuestion && cities.length > 0),
    cities,
    city: cities[0] || null,
    forecast: parsed.forecast === true,
    relativeTime,
    date,
    period,
  };

  console.log("[Weather intent]", result);
  return result;
}

module.exports = { generateChatResponse, extractWeatherIntent };
