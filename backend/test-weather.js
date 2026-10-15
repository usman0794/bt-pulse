require("dotenv").config();

async function testWeather() {
  const apiKey = process.env.OPENWEATHER_API_KEY;

  if (!apiKey) {
    console.error("OPENWEATHER_API_KEY is missing from backend/.env");
    return;
  }

  const city = "Lahore";

  const params = new URLSearchParams({
    q: city,
    appid: apiKey,
    units: "metric",
  });

  const response = await fetch(
    `https://api.openweathermap.org/data/2.5/weather?${params}`,
  );

  const data = await response.json();

  console.log("HTTP status:", response.status);
  console.log("Provider response:", {
    cod: data.cod,
    message: data.message,
    city: data.name,
    country: data.sys?.country,
    temperature: data.main?.temp,
  });
}

testWeather().catch((error) => {
  console.error("Test failed:", error.message);
});
