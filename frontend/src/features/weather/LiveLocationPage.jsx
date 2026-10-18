import { useCallback, useEffect, useState } from "react";
import {
  Cloud,
  CloudDrizzle,
  CloudFog,
  CloudLightning,
  CloudRain,
  CloudSnow,
  CloudSun,
  Droplets,
  LocateFixed,
  MapPin,
  RefreshCw,
  Sun,
  Thermometer,
  Wind,
} from "lucide-react";
import { Button } from "@/components/ui/button";

function weatherDescription(code) {
  if (code === 0) return "Clear sky";
  if ([1, 2].includes(code)) return "Mainly clear / partly cloudy";
  if (code === 3) return "Overcast";
  if ([45, 48].includes(code)) return "Foggy";
  if ([51, 53, 55, 56, 57].includes(code)) return "Drizzle";
  if ([61, 63, 65, 66, 67, 80, 81, 82].includes(code)) return "Rain";
  if ([71, 73, 75, 77, 85, 86].includes(code)) return "Snow";
  if ([95, 96, 99].includes(code)) return "Thunderstorm";
  return "Current conditions";
}

function WeatherIcon({ code, size = 42 }) {
  if (code === 0) return <Sun size={size} />;
  if ([1, 2].includes(code)) return <CloudSun size={size} />;
  if (code === 3) return <Cloud size={size} />;
  if ([45, 48].includes(code)) return <CloudFog size={size} />;
  if ([51, 53, 55, 56, 57].includes(code)) return <CloudDrizzle size={size} />;
  if ([61, 63, 65, 66, 67, 80, 81, 82].includes(code))
    return <CloudRain size={size} />;
  if ([71, 73, 75, 77, 85, 86].includes(code)) return <CloudSnow size={size} />;
  if ([95, 96, 99].includes(code)) return <CloudLightning size={size} />;
  return <CloudSun size={size} />;
}

function getBrowserPosition() {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error("Location is not supported by this browser."));
      return;
    }

    navigator.geolocation.getCurrentPosition(
      resolve,
      (error) => {
        if (error.code === error.PERMISSION_DENIED) {
          reject(
            new Error(
              "Location permission was denied. Allow location access in your browser and try again.",
            ),
          );
        } else if (error.code === error.POSITION_UNAVAILABLE) {
          reject(
            new Error(
              "Your current location could not be determined. Check your device location settings and try again.",
            ),
          );
        } else {
          reject(new Error("Location request timed out. Please try again."));
        }
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 60000 },
    );
  });
}

export default function LiveLocationPage() {
  const [weather, setWeather] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [lastUpdated, setLastUpdated] = useState(null);

  const fetchLiveWeather = useCallback(async () => {
    setLoading(true);
    setError("");

    try {
      const position = await getBrowserPosition();
      const latitude = position.coords.latitude;
      const longitude = position.coords.longitude;
      const params = new URLSearchParams({
        latitude: String(latitude),
        longitude: String(longitude),
        current:
          "temperature_2m,relative_humidity_2m,apparent_temperature,is_day,precipitation,weather_code,wind_speed_10m",
        timezone: "auto",
        forecast_days: "1",
      });

      const weatherResponse = await fetch(
        `https://api.open-meteo.com/v1/forecast?${params}`,
      );
      const weatherData = await weatherResponse.json().catch(() => ({}));
      if (!weatherResponse.ok || !weatherData.current) {
        throw new Error(
          "Unable to retrieve weather for your location right now. Please try again.",
        );
      }

      let placeName = "Your current location";
      try {
        const reverseParams = new URLSearchParams({
          lat: String(latitude),
          lon: String(longitude),
          format: "jsonv2",
          zoom: "10",
        });
        const placeResponse = await fetch(
          `https://nominatim.openstreetmap.org/reverse?${reverseParams}`,
          {
            headers: { Accept: "application/json" },
          },
        );
        const placeData = await placeResponse.json();
        const address = placeData?.address;
        const city =
          address?.city ||
          address?.town ||
          address?.village ||
          address?.municipality ||
          address?.suburb;
        const country = address?.country;
        if (city && country) placeName = `${city}, ${country}`;
        else if (placeData?.name && country)
          placeName = `${placeData.name}, ${country}`;
        else if (country) placeName = country;
      } catch {
        // Weather is still useful if reverse geocoding is temporarily unavailable.
      }

      setWeather({ ...weatherData.current, latitude, longitude, placeName });
      setLastUpdated(new Date());
    } catch (fetchError) {
      setError(fetchError.message || "Could not fetch your live location.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchLiveWeather();
  }, [fetchLiveWeather]);

  const current = weather;
  const code = current?.weather_code;

  return (
    <section className="live-location-page">
      <header className="live-location-header">
        <div>
          <p className="live-location-eyebrow">LOCATION-BASED WEATHER</p>
          <h1>Live Location</h1>
          <p className="live-location-subtitle">
            Get current weather for your device’s location.
          </p>
        </div>
        <Button
          onClick={fetchLiveWeather}
          disabled={loading}
          className="live-location-refresh"
        >
          <RefreshCw size={16} className={loading ? "animate-spin" : ""} />
          {loading ? "Locating…" : "Refresh location"}
        </Button>
      </header>

      {error ? (
        <div className="live-location-error" role="alert">
          <MapPin size={21} />
          <div>
            <strong>Couldn’t get your live weather</strong>
            <p>{error}</p>
            <p className="live-location-hint">
              Make sure location access is enabled. This feature works on HTTPS
              or localhost.
            </p>
          </div>
        </div>
      ) : loading && !current ? (
        <div className="live-location-loading" role="status" aria-live="polite">
          <div className="live-location-loading-icon">
            <LocateFixed size={28} className="animate-pulse" />
          </div>
          <h2>Finding your location</h2>
          <p>
            Allow location access when your browser asks, then we’ll load the
            current weather.
          </p>
        </div>
      ) : current ? (
        <>
          <article className="live-weather-card">
            <div className="live-weather-location">
              <MapPin size={17} />
              <span>{current.placeName}</span>
              <span className="live-location-pill">
                <span />
                Live location
              </span>
            </div>
            <div className="live-weather-main">
              <div>
                <p className="live-weather-label">CURRENT TEMPERATURE</p>
                <div className="live-weather-temperature">
                  {Math.round(current.temperature_2m)}
                  <span>°C</span>
                </div>
                <p className="live-weather-condition">
                  {weatherDescription(code)}
                </p>
                <p className="live-weather-feels">
                  Feels like {Math.round(current.apparent_temperature)}°C
                </p>
              </div>
              <div className="live-weather-icon">
                <WeatherIcon code={code} size={62} />
              </div>
            </div>
            <div className="live-weather-meta">
              <span>
                Updated{" "}
                {lastUpdated?.toLocaleTimeString([], {
                  hour: "2-digit",
                  minute: "2-digit",
                }) || "just now"}
              </span>
              <span>{current.is_day ? "Daytime" : "Nighttime"}</span>
            </div>
          </article>

          <div className="live-location-stats">
            <article className="live-location-stat">
              <span className="live-stat-icon">
                <Thermometer size={19} />
              </span>
              <span className="live-stat-label">Feels like</span>
              <strong>{Math.round(current.apparent_temperature)}°C</strong>
            </article>
            <article className="live-location-stat">
              <span className="live-stat-icon">
                <Droplets size={19} />
              </span>
              <span className="live-stat-label">Humidity</span>
              <strong>{current.relative_humidity_2m}%</strong>
            </article>
            <article className="live-location-stat">
              <span className="live-stat-icon">
                <Wind size={19} />
              </span>
              <span className="live-stat-label">Wind speed</span>
              <strong>{Math.round(current.wind_speed_10m)} km/h</strong>
            </article>
            <article className="live-location-stat">
              <span className="live-stat-icon">
                <CloudRain size={19} />
              </span>
              <span className="live-stat-label">Precipitation</span>
              <strong>{current.precipitation} mm</strong>
            </article>
          </div>
          <p className="live-location-privacy">
            Your location is requested only when this page opens or you refresh.
          </p>
        </>
      ) : null}
    </section>
  );
}
