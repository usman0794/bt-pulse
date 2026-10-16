const express = require("express");
const pool = require("../db");
const authenticateToken = require("../middleware/auth");
const { generateChatResponse } = require("../services/longcat");

const router = express.Router();

const WEATHER_CACHE_TTL = 10 * 60 * 1000;
const weatherCache = new Map();

function getCachedWeather(key) {
  const cached = weatherCache.get(key);

  if (!cached || Date.now() - cached.createdAt >= WEATHER_CACHE_TTL) {
    weatherCache.delete(key);
    return null;
  }

  return cached.data;
}

function setCachedWeather(key, data) {
  weatherCache.set(key, {
    data,
    createdAt: Date.now(),
  });
}

async function fetchOpenWeather(url) {
  const response = await fetch(url);
  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    const error = new Error(
      response.status === 404
        ? "City not found."
        : "Unable to retrieve weather data.",
    );

    error.status = response.status === 404 ? 404 : 502;
    throw error;
  }

  return data;
}

router.get("/", authenticateToken, async (req, res) => {
  try {
    // Always check the current plan in the database.
    const userResult = await pool.query(
      "SELECT plan FROM users WHERE id = $1",
      [req.user.id],
    );

    if (userResult.rowCount === 0) {
      return res.status(404).json({
        success: false,
        message: "User not found.",
      });
    }

    if (
      String(userResult.rows[0].plan || "")
        .trim()
        .toLowerCase() !== "pro"
    ) {
      return res.status(403).json({
        success: false,
        code: "PRO_REQUIRED",
        message: "A Pro subscription is required to access this dashboard.",
      });
    }

    const locationsResult = await pool.query(
      `SELECT id, label, city, country
       FROM saved_locations
       WHERE user_id = $1
       ORDER BY created_at ASC`,
      [req.user.id],
    );

    const apiKey = process.env.OPENWEATHER_API_KEY;

    if (locationsResult.rowCount > 0 && !apiKey) {
      return res.status(500).json({
        success: false,
        message: "Weather API is not configured.",
      });
    }

    const locations = await Promise.all(
      locationsResult.rows.map(async (location) => {
        const cacheKey = location.city.trim().toLowerCase();
        const cached = getCachedWeather(cacheKey);

        if (cached) {
          return {
            ...location,
            ...cached,
            cached: true,
          };
        }

        try {
          const params = new URLSearchParams({
            q: location.city,
            appid: apiKey,
            units: "metric",
          });

          const current = await fetchOpenWeather(
            `https://api.openweathermap.org/data/2.5/weather?${params}`,
          );

          const forecast = await fetchOpenWeather(
            `https://api.openweathermap.org/data/2.5/forecast?${params}`,
          );

          const airParams = new URLSearchParams({
            lat: String(current.coord.lat),
            lon: String(current.coord.lon),
            appid: apiKey,
          });

          const air = await fetchOpenWeather(
            `https://api.openweathermap.org/data/2.5/air_pollution?${airParams}`,
          );

          const dailyMap = new Map();

          for (const item of forecast.list || []) {
            const date = item.dt_txt.split(" ")[0];
            const existing = dailyMap.get(date);

            if (!existing) {
              dailyMap.set(date, {
                date,
                temperatures: [item.main.temp],
                rainProbability: Math.round((item.pop || 0) * 100),
              });
            } else {
              existing.temperatures.push(item.main.temp);
              existing.rainProbability = Math.max(
                existing.rainProbability,
                Math.round((item.pop || 0) * 100),
              );
            }
          }

          const fiveDayForecast = [...dailyMap.values()]
            .slice(0, 5)
            .map((day) => ({
              date: day.date,
              minTemperatureC: Math.min(...day.temperatures),
              maxTemperatureC: Math.max(...day.temperatures),
              rainProbability: day.rainProbability,
            }));

          const pollution = air.list?.[0];

          const airQuality = pollution
            ? {
                index: pollution.main.aqi,
                label: ["Good", "Fair", "Moderate", "Poor", "Very poor"][
                  pollution.main.aqi - 1
                ],
                pm2_5: pollution.components.pm2_5,
                pm10: pollution.components.pm10,
              }
            : null;

          const weatherData = {
            currentWeather: {
              city: current.name,
              country: current.sys.country,
              temperatureC: current.main.temp,
              feelsLikeC: current.main.feels_like,
              humidity: current.main.humidity,
              description: current.weather?.[0]?.description,
              rainProbability: fiveDayForecast[0]?.rainProbability ?? null,
            },
            forecast: fiveDayForecast,
            airQuality,
          };

          setCachedWeather(cacheKey, weatherData);

          return {
            ...location,
            ...weatherData,
            cached: false,
          };
        } catch (error) {
          return {
            ...location,
            weatherError:
              error.status === 404
                ? "City not found."
                : "Weather data is temporarily unavailable.",
          };
        }
      }),
    );

    // Reuse today's insight, generating one only when needed.
    let insightResult = await pool.query(
      `SELECT insight_text, insight_date
       FROM daily_ai_insights
       WHERE user_id = $1
         AND insight_date = CURRENT_DATE
       LIMIT 1`,
      [req.user.id],
    );

    if (insightResult.rowCount === 0) {
      const usableLocations = locations.filter(
        (location) => location.currentWeather && !location.weatherError,
      );

      if (usableLocations.length > 0) {
        const weatherContext = usableLocations.map((location) => ({
          city: location.currentWeather.city,
          country: location.currentWeather.country,
          currentWeather: location.currentWeather,
          forecast: location.forecast,
          airQuality: location.airQuality,
        }));

        const generatedInsight = await generateChatResponse([
          {
            role: "system",
            content:
              "You are BTP Weather Assistant. Write one concise daily weather insight for a Pro dashboard, around 80-120 words. Use only the supplied weather data. Mention useful temperature or rain trends and air quality when relevant. Do not invent measurements, claim certainty about future weather, or give medical advice. If air quality is poor, recommend checking local official guidance and limiting unnecessary outdoor exposure. Return only the insight text.",
          },
          {
            role: "user",
            content: `Create today's weather insight from this data:\n${JSON.stringify(
              weatherContext,
            )}`,
          },
        ]);

        const insightText =
          typeof generatedInsight === "string" ? generatedInsight.trim() : "";

        if (insightText) {
          // Keep only one insight per user per day, even with
          // simultaneous dashboard requests.
          await pool.query(
            `INSERT INTO daily_ai_insights
               (user_id, insight_date, insight_text)
             VALUES ($1, CURRENT_DATE, $2)
             ON CONFLICT (user_id, insight_date) DO NOTHING`,
            [req.user.id, insightText],
          );

          // Read the persisted record, including if another request
          // generated and saved the insight first.
          insightResult = await pool.query(
            `SELECT insight_text, insight_date
             FROM daily_ai_insights
             WHERE user_id = $1
               AND insight_date = CURRENT_DATE
             LIMIT 1`,
            [req.user.id],
          );
        }
      }
    }

    const dailyInsight = insightResult.rows[0]
      ? {
          text: insightResult.rows[0].insight_text,
          date: insightResult.rows[0].insight_date,
        }
      : null;

    return res.json({
      success: true,
      dashboard: {
        locations,
        dailyInsight,
      },
    });
  } catch (error) {
    console.error("Pro dashboard failed:", error.message);

    return res.status(500).json({
      success: false,
      message: "Unable to load the Pro dashboard.",
    });
  }
});

router.post("/locations", authenticateToken, async (req, res) => {
  try {
    // Verify the user's current plan in the database.
    const userResult = await pool.query(
      "SELECT plan FROM users WHERE id = $1",
      [req.user.id],
    );

    if (userResult.rowCount === 0) {
      return res.status(404).json({
        success: false,
        message: "User not found.",
      });
    }

    if (
      String(userResult.rows[0].plan || "")
        .trim()
        .toLowerCase() !== "pro"
    ) {
      return res.status(403).json({
        success: false,
        code: "PRO_REQUIRED",
        message: "A Pro subscription is required to save locations.",
      });
    }

    const { city, label = "Home", country = null } = req.body || {};

    if (typeof city !== "string" || !city.trim() || city.trim().length > 100) {
      return res.status(400).json({
        success: false,
        message: "Provide a valid city name (maximum 100 characters).",
      });
    }

    if (
      typeof label !== "string" ||
      !label.trim() ||
      label.trim().length > 50
    ) {
      return res.status(400).json({
        success: false,
        message: "Label must be between 1 and 50 characters.",
      });
    }

    if (
      country !== null &&
      (typeof country !== "string" || country.trim().length > 100)
    ) {
      return res.status(400).json({
        success: false,
        message: "Country must be 100 characters or fewer.",
      });
    }

    const cleanCity = city.trim();
    const cleanLabel = label.trim();
    const cleanCountry = country?.trim() || null;

    // Avoid saving the same city twice for this user.
    const duplicate = await pool.query(
      `SELECT id
       FROM saved_locations
       WHERE user_id = $1
         AND LOWER(city) = LOWER($2)
       LIMIT 1`,
      [req.user.id, cleanCity],
    );

    if (duplicate.rowCount > 0) {
      return res.status(409).json({
        success: false,
        message: "This city is already saved.",
        locationId: duplicate.rows[0].id,
      });
    }

    const result = await pool.query(
      `INSERT INTO saved_locations (user_id, label, city, country)
       VALUES ($1, $2, $3, $4)
       RETURNING id, label, city, country, created_at`,
      [req.user.id, cleanLabel, cleanCity, cleanCountry],
    );

    return res.status(201).json({
      success: true,
      message: "Location saved successfully.",
      location: result.rows[0],
    });
  } catch (error) {
    console.error("Save location failed:", error.message);

    return res.status(500).json({
      success: false,
      message: "Unable to save location.",
    });
  }
});

router.delete("/locations/:id", authenticateToken, async (req, res) => {
  try {
    // Validate the location ID before querying the database.
    const { id } = req.params;

    const uuidRegex =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

    if (!uuidRegex.test(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid location ID.",
      });
    }

    // Check the user's current plan in the database.
    const userResult = await pool.query(
      "SELECT plan FROM users WHERE id = $1",
      [req.user.id],
    );

    if (userResult.rowCount === 0) {
      return res.status(404).json({
        success: false,
        message: "User not found.",
      });
    }

    if (
      String(userResult.rows[0].plan || "")
        .trim()
        .toLowerCase() !== "pro"
    ) {
      return res.status(403).json({
        success: false,
        code: "PRO_REQUIRED",
        message: "A Pro subscription is required to delete saved locations.",
      });
    }

    // Delete only a location owned by the authenticated user.
    const result = await pool.query(
      `DELETE FROM saved_locations
       WHERE id = $1 AND user_id = $2
       RETURNING id, label, city, country`,
      [id, req.user.id],
    );

    if (result.rowCount === 0) {
      return res.status(404).json({
        success: false,
        message: "Saved location not found.",
      });
    }

    // Remove cached weather for the deleted city.
    weatherCache.delete(result.rows[0].city.trim().toLowerCase());

    return res.json({
      success: true,
      message: "Saved location deleted successfully.",
      location: result.rows[0],
    });
  } catch (error) {
    console.error("Delete location failed:", error.message);

    return res.status(500).json({
      success: false,
      message: "Unable to delete saved location.",
    });
  }
});

module.exports = router;
