// Weather data + date/time helpers (OpenWeather free plan: current + 5-day / 3-hour forecast).

const OPENWEATHER_URL = "https://api.openweathermap.org/data/2.5";
const DAY_MS = 86_400_000;
const MAX_FORECAST_DAYS = 5;

// Unix seconds + city timezone offset (seconds) -> "YYYY-MM-DD, HH:mm" in the city's local time.
function toLocal(unix, tzOffsetSec = 0) {
  return new Date((unix + tzOffsetSec) * 1000)
    .toISOString()
    .slice(0, 16)
    .replace("T", ", ");
}

// Server-side "today" (Pakistan date) used to validate the 0-5 day window.
function getPakistanDate(offsetDays = 0) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Karachi",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const v = Object.fromEntries(parts.map(({ type, value }) => [type, value]));
  const date = new Date(
    Date.UTC(Number(v.year), Number(v.month) - 1, Number(v.day) + offsetDays),
  );
  return date.toISOString().slice(0, 10);
}

function makeError(message, status) {
  const error = new Error(message);
  error.status = status;
  return error;
}

async function getWeatherData(city, forecast = false) {
  const apiKey = process.env.OPENWEATHER_API_KEY;
  if (!apiKey) throw makeError("Weather API is not configured.", 502);

  const params = new URLSearchParams({
    q: city,
    appid: apiKey,
    units: "metric",
  });
  const endpoint = forecast ? "forecast" : "weather";

  const response = await fetch(`${OPENWEATHER_URL}/${endpoint}?${params}`, {
    signal: AbortSignal.timeout(10_000),
  });
  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    console.error("[OpenWeather error]", {
      status: response.status,
      message: data.message,
    });
    if (response.status === 404) throw makeError("City not found.", 404);
    if (response.status === 401)
      throw makeError("Weather provider rejected the API key.", 502);
    throw makeError("Unable to retrieve weather data.", 502);
  }

  if (forecast) {
    const tz = data.city.timezone || 0;
    const entries = data.list.map((item) => {
      const pop =
        typeof item.pop === "number" && Number.isFinite(item.pop)
          ? Math.min(1, Math.max(0, item.pop))
          : null;
      return {
        timestampUTC: item.dt,
        dateTimeUTC: item.dt_txt,
        localTime: toLocal(item.dt, tz),
        temperatureC: item.main.temp,
        feelsLikeC: item.main.feels_like,
        humidity: item.main.humidity,
        description: item.weather?.[0]?.description ?? "Unavailable",
        windSpeedMps: item.wind?.speed ?? null,
        rainProbability: pop === null ? null : Math.round(pop * 100),
      };
    });

    return {
      type: "forecast",
      city: data.city.name,
      country: data.city.country,
      today: toLocal(Date.now() / 1000, tz).slice(0, 10),
      forecast: entries,
    };
  }

  const tz = data.timezone || 0;
  return {
    type: "current",
    city: data.name,
    country: data.sys?.country,
    temperatureC: data.main.temp,
    feelsLikeC: data.main.feels_like,
    humidity: data.main.humidity,
    description: data.weather?.[0]?.description ?? "Unavailable",
    windSpeedMps: data.wind?.speed ?? null,
    localTime: toLocal(data.dt, tz),
    updatedAtUTC: new Date(data.dt * 1000).toISOString(),
  };
}

// ---------- Date window (past dates and anything beyond 5 days are refused) ----------

function resolveRelativeTargetTimestamp(relativeTime) {
  if (typeof relativeTime !== "string") return null;
  const match = relativeTime.match(
    /\b(?:in|after)\s+(\d+(?:\.\d+)?)\s+(minutes?|hours?|days?)\b/i,
  );
  if (!match) return null;
  const amount = Number(match[1]);
  if (!Number.isFinite(amount) || amount <= 0) return null;
  const unit = match[2].toLowerCase();
  const ms = unit.startsWith("minute")
    ? 60_000
    : unit.startsWith("hour")
      ? 3_600_000
      : DAY_MS;
  return Date.now() + amount * ms;
}

// true => the request is outside "now .. +5 days"
function checkDateWindow(intent) {
  if (intent.askedPast) return true;
  if (intent.days && intent.days > MAX_FORECAST_DAYS) return true;
  if (intent.date) {
    if (intent.date < getPakistanDate(0)) return true;
    if (intent.date > getPakistanDate(MAX_FORECAST_DAYS)) return true;
  }
  if (intent.relativeTime) {
    const target = resolveRelativeTargetTimestamp(intent.relativeTime);
    if (target && target - Date.now() > MAX_FORECAST_DAYS * DAY_MS) return true;
  }
  return false;
}

// ---------- Trim the forecast to only what the question needs ----------

function selectNearestForecastEntry(entries, targetTimestamp) {
  const MAX_DISTANCE_MS = 3 * 60 * 60 * 1000;
  let nearest = null;
  let best = Infinity;
  for (const entry of entries) {
    const distance = Math.abs(entry.timestampUTC * 1000 - targetTimestamp);
    if (distance < best) {
      best = distance;
      nearest = entry;
    }
  }
  return best <= MAX_DISTANCE_MS ? nearest : null;
}

function getForecastEntriesForPeriod(entries, targetDate, period) {
  const ranges = { morning: [6, 12], afternoon: [12, 17], evening: [17, 21] };

  if (period === "night") {
    const next = new Date(`${targetDate}T12:00:00Z`);
    next.setUTCDate(next.getUTCDate() + 1);
    const followingDate = next.toISOString().slice(0, 10);
    return entries.filter((e) => {
      const [date, time] = e.localTime.split(", ");
      const hour = Number(time.split(":")[0]);
      return (
        (date === targetDate && hour >= 21) ||
        (date === followingDate && hour < 6)
      );
    });
  }

  const range = ranges[period];
  if (!range) return [];
  return entries.filter((e) => {
    const [date, time] = e.localTime.split(", ");
    const hour = Number(time.split(":")[0]);
    return date === targetDate && hour >= range[0] && hour < range[1];
  });
}

function slim(e) {
  return {
    localTime: e.localTime,
    temperatureC: e.temperatureC,
    feelsLikeC: e.feelsLikeC,
    humidity: e.humidity,
    description: e.description,
    windSpeedMps: e.windSpeedMps,
    rainProbability: e.rainProbability,
  };
}

function addDays(isoDate, n) {
  const d = new Date(`${isoDate}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

function dayLabel(iso, today) {
  const nice = new Date(`${iso}T12:00:00Z`).toLocaleDateString("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  });
  if (iso === today) return `Today (${nice})`;
  if (iso === addDays(today, 1)) return `Tomorrow (${nice})`;
  return nice;
}

// "next N days" = the N days starting tomorrow.
function summarizeDays(entries, count, today) {
  const start = addDays(today, 1);
  const byDay = {};
  for (const e of entries) {
    const day = e.localTime.slice(0, 10);
    if (day >= start) (byDay[day] ||= []).push(e);
  }
  return Object.entries(byDay)
    .slice(0, count)
    .map(([date, list]) => {
      const pops = list.map((e) => e.rainProbability).filter(Number.isFinite);
      return {
        date,
        label: dayLabel(date, today),
        lowC: Math.round(Math.min(...list.map((e) => e.temperatureC))),
        highC: Math.round(Math.max(...list.map((e) => e.temperatureC))),
        peakRainPercent: pops.length ? Math.max(...pops) : null,
        conditions: [...new Set(list.map((e) => e.description))].slice(0, 3),
      };
    });
}

function trimForecast(data, intent) {
  const base = {
    type: "forecast",
    city: data.city,
    country: data.country,
    localToday: data.today,
  };

  if (intent.days) {
    const daily = summarizeDays(data.forecast, intent.days, data.today);
    return {
      ...base,
      daily,
      note:
        daily.length < intent.days
          ? `Forecast data covers only ${daily.length} of the ${intent.days} requested days.`
          : undefined,
    };
  }

  if (intent.relativeTime) {
    const target = resolveRelativeTargetTimestamp(intent.relativeTime);
    const entry = target
      ? selectNearestForecastEntry(data.forecast, target)
      : null;
    return {
      ...base,
      requested: intent.relativeTime,
      entry: entry ? slim(entry) : null,
      note: entry
        ? "Approximate: nearest 3-hour forecast slot."
        : "No forecast slot is close enough to that time.",
    };
  }

  const day = intent.date || data.today;
  let entries;
  if (intent.period) {
    entries = getForecastEntriesForPeriod(data.forecast, day, intent.period);
  } else if (intent.date) {
    entries = data.forecast.filter((e) => e.localTime.startsWith(intent.date));
  } else {
    entries = data.forecast.slice(0, 8); // next ~24 hours
  }
  return { ...base, entries: entries.map(slim) };
}

module.exports = {
  getWeatherData,
  trimForecast,
  checkDateWindow,
  getPakistanDate,
  toLocal,
  resolveRelativeTargetTimestamp,
  getForecastEntriesForPeriod,
  summarizeDays,
};
