const express = require("express");
const pool = require("../db");
const authenticateToken = require("../middleware/auth");

const router = express.Router();

router.get("/current", authenticateToken, async (req, res) => {
  try {
    const city = req.query.city;

    if (typeof city !== "string" || !city.trim() || city.length > 100) {
      return res.status(400).json({
        success: false,
        message: "Please provide a valid city name.",
      });
    }

    const apiKey = process.env.OPENWEATHER_API_KEY;

    console.log("OpenWeather diagnostic:", {
      keyLoaded: Boolean(apiKey),
      keyLength: apiKey?.length || 0,
      keyHasWhitespace: apiKey ? apiKey !== apiKey.trim() : false,
    });

    if (!apiKey) {
      return res.status(500).json({
        success: false,
        message: "Weather API is not configured.",
      });
    }

    const params = new URLSearchParams({
      q: city.trim(),
      appid: apiKey,
      units: "metric",
    });

    const response = await fetch(
      `https://api.openweathermap.org/data/2.5/weather?${params}`,
    );

    if (response.status === 404) {
      return res.status(404).json({
        success: false,
        message: "City not found. Check the city name and try again.",
      });
    }

    if (response.status === 401) {
      const errorData = await response.json().catch(() => ({}));

      console.error("OpenWeather authentication error:", {
        status: response.status,
        message: errorData.message || "No error details provided",
      });

      return res.status(502).json({
        success: false,
        message: "Weather provider rejected the API key.",
      });
    }

    if (!response.ok) {
      console.error("Weather provider status:", response.status);

      return res.status(502).json({
        success: false,
        message: "Unable to retrieve weather data right now.",
      });
    }

    const data = await response.json();

    return res.json({
      success: true,
      weather: {
        city: data.name,
        country: data.sys.country,
        temperatureC: data.main.temp,
        feelsLikeC: data.main.feels_like,
        humidity: data.main.humidity,
        description: data.weather[0].description,
        windSpeedMps: data.wind.speed,
        updatedAt: new Date(data.dt * 1000).toISOString(),
      },
    });
  } catch (error) {
    console.error("Weather request failed:", error.message);

    return res.status(502).json({
      success: false,
      message: "Weather service is temporarily unavailable.",
    });
  }
});

router.get("/forecast", authenticateToken, async (req, res) => {
  try {
    const city = req.query.city;

    if (typeof city !== "string" || !city.trim() || city.trim().length > 100) {
      return res.status(400).json({
        success: false,
        message: "Please provide a valid city name.",
      });
    }

    const apiKey = process.env.OPENWEATHER_API_KEY;

    if (!apiKey) {
      return res.status(500).json({
        success: false,
        message: "Weather API is not configured.",
      });
    }

    const params = new URLSearchParams({
      q: city.trim(),
      appid: apiKey,
      units: "metric",
    });

    const response = await fetch(
      `https://api.openweathermap.org/data/2.5/forecast?${params}`,
    );

    const data = await response.json();

    if (!response.ok) {
      console.error("Forecast provider error:", {
        status: response.status,
        message: data.message,
      });

      if (response.status === 404) {
        return res.status(404).json({
          success: false,
          message: "City not found. Check the city name and try again.",
        });
      }

      if (response.status === 401) {
        return res.status(502).json({
          success: false,
          message: "Weather provider rejected the API key.",
        });
      }

      return res.status(502).json({
        success: false,
        message: "Unable to retrieve forecast data right now.",
      });
    }

    const forecast = data.list.map((item) => ({
      dateTime: item.dt_txt,
      temperatureC: item.main.temp,
      feelsLikeC: item.main.feels_like,
      humidity: item.main.humidity,
      description: item.weather[0].description,
      windSpeedMps: item.wind.speed,
      rainProbability: Math.round((item.pop || 0) * 100),
    }));

    return res.json({
      success: true,
      city: data.city.name,
      country: data.city.country,
      forecast,
    });
  } catch (error) {
    console.error("Forecast request failed:", error.message);

    return res.status(502).json({
      success: false,
      message: "Weather service is temporarily unavailable.",
    });
  }
});

module.exports = router;
