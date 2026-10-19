const express = require("express");
const pool = require("../db");
const authenticateToken = require("../middleware/auth");
const {
  generateChatResponse,
  extractWeatherIntent,
} = require("../services/longcat");
const {
  getWeatherData,
  trimForecast,
  checkDateWindow,
  getPakistanDate,
} = require("../services/weather");

const router = express.Router();

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const MAX_CITIES = 3;
const HISTORY_LIMIT = 6;

const FREE_DAILY_PROMPT_LIMIT = 5;
const USAGE_TIME_ZONE = "Asia/Karachi";

// Reserve one Free-plan prompt atomically per user and Pakistan-local date.
// The advisory lock also protects the first insert when no usage row exists yet.
async function reserveFreePrompt(userId) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const dateResult = await client.query(
      "SELECT (NOW() AT TIME ZONE $1)::date::text AS usage_date",
      [USAGE_TIME_ZONE],
    );
    const usageDate = dateResult.rows[0].usage_date;
    const lockKey = `${userId}:${usageDate}`;
    await client.query(
      "SELECT pg_advisory_xact_lock(hashtextextended($1, 0))",
      [lockKey],
    );

    const usageResult = await client.query(
      `SELECT id, message_count
       FROM usage_records
       WHERE user_id = $1 AND usage_date = $2
       ORDER BY id
       LIMIT 1`,
      [userId, usageDate],
    );
    const used = Number(usageResult.rows[0]?.message_count || 0);
    if (used >= FREE_DAILY_PROMPT_LIMIT) {
      await client.query("COMMIT");
      return { allowed: false, used, remaining: 0, usageDate };
    }

    if (usageResult.rowCount > 0) {
      await client.query(
        "UPDATE usage_records SET message_count = $1 WHERE id = $2",
        [used + 1, usageResult.rows[0].id],
      );
    } else {
      await client.query(
        `INSERT INTO usage_records (user_id, usage_date, message_count)
         VALUES ($1, $2, 1)`,
        [userId, usageDate],
      );
    }
    await client.query("COMMIT");
    return {
      allowed: true,
      used: used + 1,
      remaining: Math.max(0, FREE_DAILY_PROMPT_LIMIT - used - 1),
      usageDate,
    };
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}

// Refund a reserved prompt if the chat request fails before returning a reply.
async function refundFreePrompt(userId, usageDate) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(
      "SELECT pg_advisory_xact_lock(hashtextextended($1, 0))",
      [`${userId}:${usageDate}`],
    );
    await client.query(
      `UPDATE usage_records
       SET message_count = GREATEST(message_count - 1, 0)
       WHERE user_id = $1 AND usage_date = $2`,
      [userId, usageDate],
    );
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}

// Fixed replies (no AI call needed).
const REPLIES = {
  greeting:
    "Hello! I'm your BTP Weather Assistant. Ask me about current weather, forecasts, temperature, or rain chances for any city.",
  thanks: "You're welcome! Ask me anytime about the weather in any city.",
  other:
    'I can only help with weather: current conditions, temperature, rain chances and forecasts for any city (up to 5 days ahead). Try "Lahore weather tomorrow evening" or "compare weather of Lahore and Karachi".',
  outOfRange:
    'I can only share weather for right now and the next 5 days, not past dates or times. Try asking about today, tomorrow, or "the next 3 hours" for any city, or compare up to three cities.',
  askCity:
    "Which city would you like the weather for? You can name up to three cities to compare.",
  notFound: (names) =>
    `I couldn't find ${names.join(", ")}. Please check the spelling or send a nearby city name.`,
};

// Our own "ask for a city" replies; used to recognise a city-only follow-up.
const PENDING_CITY_PATTERN = /which city|check the spelling/i;

const NOT_A_CITY = new Set([
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

function isValidCity(value) {
  return (
    typeof value === "string" &&
    value.trim().length > 0 &&
    value.trim().length <= 100 &&
    !NOT_A_CITY.has(value.trim().toLowerCase())
  );
}

// Adds conversations.last_city once (safe to run repeatedly).
let columnReady = null;
function ensureLastCityColumn() {
  if (!columnReady) {
    columnReady = pool
      .query(
        "ALTER TABLE conversations ADD COLUMN IF NOT EXISTS last_city TEXT",
      )
      .catch((error) => {
        console.error("Could not ensure last_city column:", error.message);
        columnReady = null;
      });
  }
  return columnReady;
}

function buildSystemMessage(weatherData, today, notFound) {
  const notFoundNote = notFound.length
    ? `\nThese places could not be found: ${notFound.join(", ")}. Say so briefly and do not invent data for them.`
    : "";

  return `You are BTP Weather Assistant, a chatbot for weather questions only.
Answer the latest question briefly using ONLY the weather data below. Never invent numbers, dates or places.
Today's date is ${today}. Units: Celsius, wind in metres per second. Times are the city's local time (24-hour).
Forecast entries are about 3 hours apart, so say "around" for times and never present them as exact hourly values. If "note" says approximate, mention that.
Rain probability is a chance, not a guarantee. Never add probabilities together or treat missing data as 0%.
For "daily" data, write one line per day using its "label", with low-high and peak rain chance. Do not add, skip or rename days.
Use plain text only: no tables and no markdown symbols (* # | - _). With several cities write one line per city (name, temperature, feels like, humidity, sky, wind), then one short line comparing them. Otherwise answer in 2-5 short lines.
If the data type is "current", describe current conditions only and never mention forecasts or missing forecast data.
If entries are empty or data is unavailable, say the forecast is not available for that time.${notFoundNote}
Weather data:
${JSON.stringify(weatherData)}`;
}

// POST /api/chat
router.post("/", authenticateToken, async (req, res) => {
  let reservedFreePrompt = null;
  let userIdForUsage = null;
  let isPro = false;
  let promptUsage = null;
  try {
    await ensureLastCityColumn();

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
    userIdForUsage = req.user.id;
    let activeConversationId = conversationId || null;
    let history = [];
    let previousCity = null; // remembered per conversation (conversations.last_city)

    if (activeConversationId) {
      const existing = await pool.query(
        "SELECT last_city FROM conversations WHERE id = $1 AND user_id = $2",
        [activeConversationId, req.user.id],
      );
      if (existing.rowCount === 0) {
        return res
          .status(404)
          .json({ success: false, message: "Conversation not found." });
      }
      previousCity = existing.rows[0].last_city || null;

      const historyResult = await pool.query(
        `SELECT role, content FROM messages
         WHERE conversation_id = $1
         ORDER BY created_at DESC, id DESC LIMIT $2`,
        [activeConversationId, HISTORY_LIMIT],
      );
      history = historyResult.rows.reverse().map((m) => ({
        role: m.role,
        content: String(m.content).slice(0, 600),
      }));
    }

    userIdForUsage = req.user.id;

    // Read the current plan from PostgreSQL rather than trusting client input.
    const userPlanResult = await pool.query(
      "SELECT plan FROM users WHERE id = $1 LIMIT 1",
      [req.user.id],
    );
    if (userPlanResult.rowCount === 0) {
      return res
        .status(401)
        .json({ success: false, message: "User account not found." });
    }
    const currentPlan = String(
      userPlanResult.rows[0].plan || "free",
    ).toLowerCase();
    isPro = currentPlan === "pro";

    if (!isPro) {
      promptUsage = await reserveFreePrompt(req.user.id);
      if (!promptUsage.allowed) {
        return res.status(429).json({
          success: false,
          code: "DAILY_PROMPT_LIMIT_REACHED",
          message:
            "You've used all 5 free AI prompts for today. Your prompts reset at midnight Pakistan time. Upgrade to Pro for unlimited prompts.",
          plan: "free",
          dailyPromptLimit: FREE_DAILY_PROMPT_LIMIT,
          promptsUsed: promptUsage.used,
          promptsRemaining: 0,
          usageDate: promptUsage.usageDate,
          upgradeRequired: true,
        });
      }
      reservedFreePrompt = promptUsage;
    }

    const lastAssistantMessage =
      [...history].reverse().find((m) => m.role === "assistant")?.content || "";
    const pendingCityQuestion = PENDING_CITY_PATTERN.test(lastAssistantMessage);
    const lastUserMessage =
      [...history].reverse().find((m) => m.role === "user")?.content || "";
    const today = getPakistanDate(0);

    const intent = await extractWeatherIntent(userMessage, {
      previousCity,
      pendingCityQuestion,
      history,
      today,
      carryMessage: pendingCityQuestion ? lastUserMessage : "",
    });

    let answer = "";
    let weatherData = null;
    let rememberCity = null;

    if (intent.topic !== "weather") {
      // Greetings, thanks and off-topic questions get a fixed, friendly reply.
      answer = REPLIES[intent.topic] || REPLIES.other;
    } else if (checkDateWindow(intent)) {
      answer = REPLIES.outOfRange;
    } else {
      let cities = Array.isArray(intent.cities)
        ? intent.cities.filter(isValidCity)
        : [];
      if (cities.length === 0 && isValidCity(city)) cities = [city.trim()];
      if (cities.length === 0 && isValidCity(previousCity))
        cities = [previousCity];
      cities = [
        ...new Map(cities.map((c) => [c.toLowerCase(), c])).values(),
      ].slice(0, MAX_CITIES);

      if (cities.length === 0) {
        answer = REPLIES.askCity;
      } else {
        const needsForecast = Boolean(
          intent.forecast ||
          forecast === true ||
          intent.period ||
          intent.days ||
          intent.relativeTime ||
          (intent.date && intent.date !== today),
        );

        const results = await Promise.allSettled(
          cities.map(async (name) => {
            const data = await getWeatherData(name, needsForecast);
            return data.type === "forecast" ? trimForecast(data, intent) : data;
          }),
        );

        const found = [];
        const notFound = [];
        const errors = [];
        results.forEach((result, i) => {
          if (result.status === "fulfilled") found.push(result.value);
          else if (result.reason?.status === 404) notFound.push(cities[i]);
          else errors.push(result.reason);
        });

        if (found.length === 0) {
          if (errors.length > 0) throw errors[0];
          answer = REPLIES.notFound(notFound);
        } else {
          weatherData = found.length === 1 ? found[0] : found;
          rememberCity = found[0].city;
          answer = await generateChatResponse([
            {
              role: "system",
              content: buildSystemMessage(weatherData, today, notFound),
            },
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

    await pool.query(
      `INSERT INTO messages (conversation_id, role, content, created_at)
       VALUES ($1, 'user', $2, clock_timestamp()),
              ($1, 'assistant', $3, clock_timestamp())`,
      [activeConversationId, userMessage, answer],
    );
    await pool.query(
      `UPDATE conversations
       SET updated_at = NOW(), last_city = COALESCE($3, last_city)
       WHERE id = $1 AND user_id = $2`,
      [activeConversationId, req.user.id, rememberCity],
    );

    return res.json({
      success: true,
      conversationId: activeConversationId,
      answer,
      weather: weatherData,
      plan: isPro ? "pro" : "free",
      dailyPromptLimit: isPro ? null : FREE_DAILY_PROMPT_LIMIT,
      promptsUsed: isPro ? null : promptUsage.used,
      promptsRemaining: isPro ? null : promptUsage.remaining,
      usageDate: isPro ? null : promptUsage.usageDate,
    });
  } catch (error) {
    if (reservedFreePrompt && userIdForUsage) {
      try {
        await refundFreePrompt(userIdForUsage, reservedFreePrompt.usageDate);
      } catch (refundError) {
        console.error(
          "Could not refund failed chat prompt:",
          refundError.message,
        );
      }
    }
    console.error("Chat request failed:", error);

    if (error.status === 413 || error.status === 429) {
      return res.status(429).json({
        success: false,
        message:
          "The assistant is busy right now. Please try again in a few seconds.",
      });
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
