const express = require("express");
const authenticateToken = require("../middleware/auth");
const { getWeatherData } = require("../services/weather");

const router = express.Router();

function validCity(value) {
  return typeof value === "string" && value.trim() && value.trim().length <= 100;
}

function sendError(res, error, fallbackMessage) {
  if (error.status === 404) {
    return res.status(404).json({
      success: false,
      message: "City not found. Check the city name and try again.",
    });
  }
  console.error("Weather request failed:", error.message);
  return res.status(502).json({ success: false, message: fallbackMessage });
}

router.get("/current", authenticateToken, async (req, res) => {
  if (!validCity(req.query.city)) {
    return res
      .status(400)
      .json({ success: false, message: "Please provide a valid city name." });
  }

  try {
    const data = await getWeatherData(req.query.city.trim(), false);
    return res.json({
      success: true,
      weather: {
        city: data.city,
        country: data.country,
        temperatureC: data.temperatureC,
        feelsLikeC: data.feelsLikeC,
        humidity: data.humidity,
        description: data.description,
        windSpeedMps: data.windSpeedMps,
        updatedAt: data.updatedAtUTC,
      },
    });
  } catch (error) {
    return sendError(res, error, "Weather service is temporarily unavailable.");
  }
});

router.get("/forecast", authenticateToken, async (req, res) => {
  if (!validCity(req.query.city)) {
    return res
      .status(400)
      .json({ success: false, message: "Please provide a valid city name." });
  }

  try {
    const data = await getWeatherData(req.query.city.trim(), true);
    return res.json({
      success: true,
      city: data.city,
      country: data.country,
      forecast: data.forecast.map((e) => ({
        dateTime: e.dateTimeUTC,
        temperatureC: e.temperatureC,
        feelsLikeC: e.feelsLikeC,
        humidity: e.humidity,
        description: e.description,
        windSpeedMps: e.windSpeedMps,
        rainProbability: e.rainProbability ?? 0,
      })),
    });
  } catch (error) {
    return sendError(res, error, "Weather service is temporarily unavailable.");
  }
});

module.exports = router;
