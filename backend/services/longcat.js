require("dotenv").config();
const OpenAI = require("openai");

const apiKey = process.env.GROQ_API_KEY;

if (!apiKey) {
  throw new Error("GROQ_API_KEY is missing from backend/.env");
}

const client = new OpenAI({
  apiKey,
  baseURL: process.env.GROQ_BASE_URL || "https://api.groq.com/openai/v1",
});

const MODEL = process.env.GROQ_MODEL || "llama-3.3-70b-versatile";

async function generateChatResponse(messages) {
  const response = await client.chat.completions.create({
    model: MODEL,
    messages,
    max_tokens: 700,
    temperature: 0.3,
  });

  const content = response.choices?.[0]?.message?.content;

  if (typeof content !== "string" || !content.trim()) {
    console.error("[Chat response] Empty response:", {
      finishReason: response.choices?.[0]?.finish_reason,
      usage: response.usage,
    });
    throw new Error("The AI provider returned an empty response.");
  }

  return content.trim();
}

// ---------- Intent parsing ----------

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

const NUMBER_WORDS = {
  a: 1,
  an: 1,
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  nine: 9,
  ten: 10,
  eleven: 11,
  twelve: 12,
  fifteen: 15,
  twenty: 20,
  thirty: 30,
};
const NUM = `(\\d+(?:\\.\\d+)?|${Object.keys(NUMBER_WORDS).join("|")})`;

function parseNumber(token) {
  const t = String(token).toLowerCase();
  if (/^\d+(?:\.\d+)?$/.test(t)) {
    const n = Number(t);
    return n > 0 ? n : null;
  }
  return NUMBER_WORDS[t] || null;
}

// Accepts ["Lahore"], "Lahore", "Lahore and Karachi", [{name:"Lahore"}].
function toList(value) {
  if (typeof value === "string") return value.split(/\s*(?:,|&|\band\b)\s*/i);
  if (Array.isArray(value)) {
    return value.map((x) =>
      x && typeof x === "object" ? x.name || x.city || "" : x,
    );
  }
  return [];
}

function normalizeCityList(parsed) {
  let raw = toList(parsed.cities);
  if (raw.length === 0) raw = toList(parsed.city);

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

const NOT_A_CITY = new Set([
  "today",
  "tomorrow",
  "tonight",
  "now",
  "currently",
  "forecast",
  "weather",
  "temperature",
  "rain",
  "morning",
  "afternoon",
  "evening",
  "night",
  "it",
]);

// Safety net when the AI returns no city: read it straight from the message.
function guessCities(message, pendingCityQuestion) {
  const text = String(message || "")
    .trim()
    .replace(/[?!.]+$/, "")
    .replace(
      /^compare\s+(?:the\s+)?(?:weather|temperature|forecast)\s+(?:of|in|for|between|at)?\s*/i,
      "compare ",
    );
  const stop =
    "today|tomorrow|tonight|now|right|this|next|in|after|at|on|for|during|please|pls|plz|later|weather|forecast|temperature|temp|rain|humidity|wind|will|is|be";
  const pattern = new RegExp(
    `\\b(?:in|of|for|at|compare|about)\\s+([a-z][a-z .'-]*?)(?=\\s+(?:${stop})\\b|[?!.,]|$)`,
    "i",
  );

  let candidate = null;
  const match = text.match(pattern);
  const andMatch = text.match(/^and\s+([a-z][a-z .'-]*)$/i);
  if (match) {
    candidate = match[1];
  } else if (andMatch) {
    candidate = andMatch[1];
  } else if (
    pendingCityQuestion &&
    /^[a-z][a-z .'-]{1,60}$/i.test(text) &&
    text.split(/\s+/).length <= 5 &&
    !/\b(thanks?|thank|bye|never mind|nothing|cancel|stop|no|nope|ok|okay)\b/i.test(
      text,
    )
  ) {
    candidate = text;
  }
  if (!candidate) return [];

  return candidate
    .split(/\s*(?:,|&|\band\b|\bvs\.?\b|\bor\b)\s*/i)
    .map((c) => c.trim())
    .filter(
      (c) =>
        c &&
        !NOT_A_CITY.has(c.toLowerCase()) &&
        !/\b(today|tomorrow|tonight|morning|afternoon|evening|night|now|week|hours?|days?|minutes?)\b/i.test(
          c,
        ),
    )
    .slice(0, 3);
}

// "in three hours" / "after 2 hours" -> "in 3 hours"
function normalizeRelativeTime(value) {
  if (typeof value !== "string") return null;
  const m = value
    .trim()
    .toLowerCase()
    .match(/^(?:in|after)\s+(\w+(?:\.\d+)?)\s+(minutes?|hours?|days?)$/);
  if (!m) return null;
  const n = parseNumber(m[1]);
  return n ? `in ${n} ${m[2]}` : null;
}

// Safety net for "next three hours" / "next 3 days" if the AI missed them.
function guessTime(message) {
  const hm = String(message).match(
    new RegExp(`\\b(?:next|in|after)\\s+${NUM}\\s+(minutes?|hours?)\\b`, "i"),
  );
  if (hm)
    return { relativeTime: `in ${parseNumber(hm[1])} ${hm[2].toLowerCase()}` };
  const dm = String(message).match(
    new RegExp(`\\bnext\\s+${NUM}\\s+days?\\b`, "i"),
  );
  if (dm) return { days: parseNumber(dm[1]) };
  return {};
}

const TOPICS = new Set(["weather", "greeting", "thanks", "other"]);
const PERIODS = new Set(["morning", "afternoon", "evening", "night"]);

// Turns whatever the model returned into a safe, predictable object.
function normalizeIntent(
  parsed,
  {
    pendingCityQuestion = false,
    message = "",
    today = null,
    canFollowUp = false,
    carryMessage = "",
  } = {},
) {
  let cities = normalizeCityList(parsed);

  let topic = TOPICS.has(parsed.topic)
    ? parsed.topic
    : parsed.asksWeather === true
      ? "weather"
      : "other";
  // A city-only reply to "Which city?" is a weather message.
  if (pendingCityQuestion && cities.length > 0) topic = "weather";
  // Short follow-ups in a chat that already has a city ("next three hours").
  if (
    topic === "other" &&
    (STRONG_WEATHER.test(message) ||
      (canFollowUp && FOLLOW_UP_PATTERN.test(message)))
  ) {
    topic = "weather";
  }
  // The AI said "weather" but gave no city: try to read it from the message.
  if (topic === "weather" && cities.length === 0) {
    cities = guessCities(message, pendingCityQuestion);
  }

  let relativeTime = normalizeRelativeTime(parsed.relativeTime);
  let period =
    typeof parsed.period === "string" &&
    PERIODS.has(parsed.period.toLowerCase())
      ? parsed.period.toLowerCase()
      : null;
  let date =
    typeof parsed.date === "string" &&
    /^\d{4}-\d{2}-\d{2}$/.test(parsed.date.trim()) &&
    !Number.isNaN(Date.parse(parsed.date.trim()))
      ? parsed.date.trim()
      : null;
  let days =
    Number.isInteger(parsed.days) && parsed.days > 0 ? parsed.days : null;

  if (topic === "weather") {
    // Time words in the message are decided by the server, not guessed by the AI.
    const g = guessTimeFields(message, today);
    if (g.dateStrong) date = g.dateStrong;
    else if (!date && g.dateWeak) date = g.dateWeak;
    if (!period && g.period) period = g.period;
    if (!relativeTime && g.relativeTime) relativeTime = g.relativeTime;
    if (!days && g.days) days = g.days;

    // Answer to "Which city?": reuse the time from the question that came before it.
    if (
      pendingCityQuestion &&
      carryMessage &&
      !date &&
      !period &&
      !relativeTime &&
      !days
    ) {
      const c = guessTimeFields(carryMessage, today);
      date = c.dateStrong || c.dateWeak || null;
      period = c.period || null;
      relativeTime = c.relativeTime || null;
      days = c.days || null;
    }

    // "tomorrow" is a date, not a duration; a range ignores single dates.
    if (date || period) relativeTime = null;
    if (days) {
      date = null;
      relativeTime = null;
    }
  }

  return {
    topic,
    asksWeather: topic === "weather",
    cities,
    city: cities[0] || null,
    forecast:
      parsed.forecast === true || Boolean(relativeTime || days || period),
    relativeTime,
    date,
    period,
    days,
    askedPast:
      topic === "weather" &&
      (parsed.askedPast === true || PAST_PATTERN.test(message)),
  };
}

function addDays(isoDate, n) {
  const d = new Date(`${isoDate}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

// Reads "tomorrow", "day after tomorrow", "today", "tonight", "morning"... from the text.
function guessTimeFields(text, today) {
  const msg = String(text || "");
  const out = { ...guessTime(msg) };

  if (today) {
    const explicit = guessExplicitDate(msg, today);
    if (explicit) out.dateStrong = explicit;
    else if (/\bday after tomorrow\b/i.test(msg))
      out.dateStrong = addDays(today, 2);
    else if (/\btomorrow\b/i.test(msg)) out.dateStrong = addDays(today, 1);
    else if (/\b(today|tonight)\b/i.test(msg)) out.dateWeak = today;
  }
  const pm = msg.match(/\b(tonight|morning|afternoon|evening|night)\b/i);
  if (pm)
    out.period =
      pm[1].toLowerCase() === "tonight" ? "night" : pm[1].toLowerCase();
  return out;
}

const MONTHS = {
  jan: 0,
  feb: 1,
  mar: 2,
  apr: 3,
  may: 4,
  jun: 5,
  jul: 6,
  aug: 7,
  sep: 8,
  oct: 9,
  nov: 10,
  dec: 11,
};
const MONTH_RE =
  "(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)";

// "30 october", "october 30th", "5 oct" -> YYYY-MM-DD (current year)
function guessExplicitDate(message, today) {
  if (!today) return null;
  const msg = String(message || "");
  let day, mon;
  let m = msg.match(
    new RegExp(
      `\\b(\\d{1,2})(?:st|nd|rd|th)?\\s+(?:of\\s+)?${MONTH_RE}\\b`,
      "i",
    ),
  );
  if (m) {
    day = Number(m[1]);
    mon = MONTHS[m[2].slice(0, 3).toLowerCase()];
  } else if (
    (m = msg.match(
      new RegExp(`\\b${MONTH_RE}\\s+(\\d{1,2})(?:st|nd|rd|th)?\\b`, "i"),
    ))
  ) {
    mon = MONTHS[m[1].slice(0, 3).toLowerCase()];
    day = Number(m[2]);
  } else {
    return null;
  }
  const d = new Date(Date.UTC(Number(today.slice(0, 4)), mon, day, 12));
  if (d.getUTCMonth() !== mon || d.getUTCDate() !== day) return null;
  return d.toISOString().slice(0, 10);
}

const PAST_PATTERN =
  /\byesterday\b|\b\d+\s+(?:minutes?|hours?|days?|weeks?)\s+ago\b|\blast\s+(?:night|week|month|year)\b/i;

// Clear weather words: enough to treat a message as weather even in a brand-new chat.
const STRONG_WEATHER =
  /\b(weather|temperature|forecast|rain|raining|humidity)\b/i;

// Short follow-ups the AI sometimes mislabels as off-topic ("next three hours", "tomorrow evening").
const FOLLOW_UP_PATTERN = new RegExp(
  `\\b(?:next|in|after)\\s+${NUM}\\s+(?:minutes?|hours?|days?)\\b|\\b(?:tomorrow|tonight)\\b|\\b(?:morning|afternoon|evening)\\b|\\b(?:weather|temperature|temp|forecast|rain|raining|humidity|wind|snow|hot|cold|compare|vs|versus)\\b`,
  "i",
);

// Used only when the model returns unusable JSON. Never invents a city.
function fallbackIntent(message, pendingCityQuestion) {
  const weatherLike =
    /\b(weather|temperature|temp|forecast|rain|raining|humidity|wind|snow|cloudy|sunny|tomorrow|today|tonight)\b/i.test(
      message,
    );
  const greeting =
    /^\s*(hi|hello|hey|salam|assalam[\w\s-]*|good\s+(morning|afternoon|evening))\b/i.test(
      message,
    );
  const thanks = /\b(thanks|thank you|bye|goodbye)\b/i.test(message);

  return {
    topic:
      weatherLike || (pendingCityQuestion && !thanks)
        ? "weather"
        : greeting
          ? "greeting"
          : thanks
            ? "thanks"
            : "other",
    cities: [],
    forecast: /\b(forecast|tomorrow|tonight|evening|afternoon|morning)\b/i.test(
      message,
    ),
  };
}

function weekdayOf(isoDate) {
  try {
    return new Date(`${isoDate}T12:00:00Z`).toLocaleDateString("en-US", {
      weekday: "long",
      timeZone: "UTC",
    });
  } catch {
    return null;
  }
}

const INTENT_PROMPT = `You are the intent parser for BTP Weather Assistant, which only answers weather questions.
Return exactly one JSON object:
{"topic":"other","cities":[],"forecast":false,"relativeTime":null,"date":null,"period":null,"days":null,"askedPast":false}

Rules:
- topic: "weather" for current weather, temperature, feels-like, rain, humidity, wind, snow, clouds, conditions, forecasts or comparing weather. "greeting" for hello/hi/how are you. "thanks" for thanks/bye. "other" for anything else (maths, coding, news, jokes, general knowledge, personal questions).
- If pendingCityQuestion is true, the assistant just asked for a city. A reply naming one or more places (e.g. "Jhang and Sialkot") is topic "weather": extract the cities and carry over the date, period, days, relativeTime and forecast from the user's earlier weather question in recentHistory. A reply that is not a place (e.g. "never mind") is "other" or "thanks" with no cities.
- Use recentHistory for follow-ups ("what about tomorrow?", "and Karachi?", "will it rain there?"). These are topic "weather".
- cities: 0 to 3 place names as the user wrote them (fix only obvious typos). Never put dates, times or weather words in cities. If the user names no city, leave it empty.
- forecast: true only when asking about later times (later today, tonight, tomorrow, a date, a day range, rain later). false for "now", "current" or "today's weather".
- date: YYYY-MM-DD resolved from "today" in the payload ("tomorrow", "day after tomorrow", "Friday", "25 Oct"). Use today's date for "today". null if no day is mentioned.
- period: "morning", "afternoon", "evening" or "night" when requested ("tonight" = night), else null.
- relativeTime: for "in/after/next N minutes|hours" write "in N hours" (digits only, e.g. "next three hours" -> "in 3 hours"). Else null. Never turn "tomorrow" or "tonight" into a relativeTime.
- days: integer for a range ("next two days" = 2, "next 3 days" = 3). For a range leave date and relativeTime null and set forecast=true.
- askedPast: true if the user asks about the past (yesterday, last week, "2 hours ago", any date before today). Still extract the city.
- Never invent a city, date or time. Output valid JSON only, no Markdown.`;

async function extractWeatherIntent(message, context = {}) {
  if (typeof message !== "string" || !message.trim()) {
    throw new Error("A valid message is required to extract weather intent.");
  }

  const previousCity =
    typeof context.previousCity === "string" && context.previousCity.trim()
      ? context.previousCity.trim()
      : null;
  const pendingCityQuestion = context.pendingCityQuestion === true;
  const today = typeof context.today === "string" ? context.today : null;
  const recentHistory = Array.isArray(context.history)
    ? context.history.slice(-6).map((item) => ({
        role: item.role === "assistant" ? "assistant" : "user",
        content: String(item.content || "").slice(0, 500),
      }))
    : [];

  const payload = {
    message: message.trim(),
    today,
    todayWeekday: today ? weekdayOf(today) : null,
    previousCity,
    pendingCityQuestion,
    recentHistory,
  };

  const response = await client.chat.completions.create({
    model: MODEL,
    messages: [
      { role: "system", content: INTENT_PROMPT },
      { role: "user", content: JSON.stringify(payload) },
    ],
    max_tokens: 250,
    temperature: 0,
  });

  const content = response.choices?.[0]?.message?.content;

  console.log("[Intent raw]", content);

  let parsed;
  try {
    if (typeof content !== "string" || !content.trim()) {
      throw new Error("Empty intent response");
    }
    parsed = parseJsonObject(content);
  } catch (error) {
    console.error(
      "[Intent] Unusable AI output, using fallback:",
      error.message,
    );
    parsed = fallbackIntent(message, pendingCityQuestion);
  }

  const intent = normalizeIntent(parsed, {
    pendingCityQuestion,
    message,
    today,
    canFollowUp: Boolean(previousCity),
    carryMessage: pendingCityQuestion ? String(context.carryMessage || "") : "",
  });
  console.log("[Intent]", intent);
  return intent;
}

module.exports = {
  generateChatResponse,
  extractWeatherIntent,
  normalizeIntent,
};
