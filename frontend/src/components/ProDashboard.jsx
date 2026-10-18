import { useCallback, useEffect, useState } from "react";
import {
  getProDashboard,
  saveProLocation,
  deleteProLocation,
} from "../services/api";

function formatDate(dateString) {
  if (!dateString) return "—";

  return new Date(`${dateString}T12:00:00`).toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

function WeatherCard({ location, onRemove, removing }) {
  const current = location.currentWeather;
  const air = location.airQuality;

  return (
    <article className="rounded-2xl border border-[var(--line)] bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-sm text-[var(--ink-600)]">{location.label}</p>
          <h3 className="text-xl font-semibold text-[var(--ink-900)]">
            {location.city}
            {location.country ? `, ${location.country}` : ""}
          </h3>
        </div>

        <div className="flex items-center gap-2">
          <span className="rounded-full bg-[var(--info-bg)] px-3 py-1 text-xs font-medium text-[var(--info-text)]">
            {location.cached ? "Cached" : "Live"}
          </span>
          <button
            type="button"
            onClick={onRemove}
            disabled={removing}
            className="rounded-lg border border-[var(--danger)] px-3 py-1.5 text-xs font-medium text-[var(--danger)] hover:bg-[var(--bg-soft)] disabled:opacity-50"
          >
            {removing ? "Removing…" : "Remove"}
          </button>
        </div>
      </div>

      {location.weatherError ? (
        <p className="mt-4 rounded-lg bg-[var(--bg-soft)] p-3 text-sm text-[var(--warning)]">
          {location.weatherError}
        </p>
      ) : (
        <>
          {current && (
            <div className="mt-5">
              <p className="text-4xl font-bold text-[var(--ink-900)]">
                {Math.round(current.temperatureC)}°C
              </p>
              <p className="mt-1 capitalize text-[var(--ink-600)]">
                {current.description || "Conditions unavailable"}
              </p>
              <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
                <Metric
                  label="Feels like"
                  value={`${Math.round(current.feelsLikeC)}°C`}
                />
                <Metric label="Humidity" value={`${current.humidity}%`} />
                <Metric
                  label="Rain probability"
                  value={
                    current.rainProbability == null
                      ? "Unavailable"
                      : `${current.rainProbability}%`
                  }
                />
              </div>
            </div>
          )}

          <div className="mt-6">
            <h4 className="font-semibold text-[var(--ink-900)]">
              Five-day forecast
            </h4>

            {location.forecast?.length ? (
              <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
                {location.forecast.map((day) => (
                  <div
                    key={day.date}
                    className="rounded-xl bg-[var(--bg-soft)] p-3"
                  >
                    <p className="text-xs text-[var(--ink-600)]">
                      {formatDate(day.date)}
                    </p>
                    <p className="mt-2 font-semibold text-[var(--ink-900)]">
                      {Math.round(day.maxTemperatureC)}° /{" "}
                      {Math.round(day.minTemperatureC)}°
                    </p>
                    <p className="mt-1 text-xs text-[var(--ink-600)]">
                      Rain: {day.rainProbability}%
                    </p>
                  </div>
                ))}
              </div>
            ) : (
              <p className="mt-2 text-sm text-[var(--ink-600)]">
                Forecast unavailable.
              </p>
            )}
          </div>

          <div className="mt-5 rounded-xl border border-[var(--line)] p-4">
            <h4 className="font-semibold text-[var(--ink-900)]">Air quality</h4>

            {air ? (
              <>
                <p
                  className={`mt-1 text-sm font-medium ${
                    air.index <= 1
                      ? "text-[var(--success)]"
                      : air.index <= 3
                        ? "text-[var(--warning)]"
                        : "text-[var(--danger)]"
                  }`}
                >
                  {air.label} (AQI {air.index})
                </p>
                <div className="mt-3 grid grid-cols-2 gap-3">
                  <Metric label="PM2.5" value={`${air.pm2_5} µg/m³`} />
                  <Metric label="PM10" value={`${air.pm10} µg/m³`} />
                </div>
              </>
            ) : (
              <p className="mt-2 text-sm text-[var(--ink-600)]">
                Air quality data unavailable.
              </p>
            )}
          </div>
        </>
      )}
    </article>
  );
}

function Metric({ label, value }) {
  return (
    <div className="rounded-lg bg-[var(--bg-soft)] p-3">
      <p className="text-xs text-[var(--ink-600)]">{label}</p>
      <p className="mt-1 font-semibold text-[var(--ink-900)]">{value}</p>
    </div>
  );
}

function SkeletonBlock({ className = "" }) {
  return (
    <div
      aria-hidden="true"
      className={`animate-pulse rounded-md bg-[var(--line)] ${className}`}
    />
  );
}

function WeatherCardSkeleton() {
  return (
    <article
      aria-hidden="true"
      className="space-y-5 rounded-2xl border border-[var(--line)] bg-white p-5 shadow-sm"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 space-y-2">
          <SkeletonBlock className="h-4 w-20" />
          <SkeletonBlock className="h-6 w-40 max-w-full" />
        </div>
        <SkeletonBlock className="h-6 w-16 rounded-full" />
      </div>
      <div className="space-y-3">
        <SkeletonBlock className="h-10 w-28" />
        <SkeletonBlock className="h-4 w-36" />
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {Array.from({ length: 3 }, (_, index) => (
            <div key={index} className="rounded-lg bg-[var(--bg-soft)] p-3">
              <SkeletonBlock className="h-3 w-16" />
              <SkeletonBlock className="mt-2 h-5 w-20 max-w-full" />
            </div>
          ))}
        </div>
      </div>
      <div>
        <SkeletonBlock className="h-5 w-40" />
        <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          {Array.from({ length: 5 }, (_, index) => (
            <div key={index} className="rounded-xl bg-[var(--bg-soft)] p-3">
              <SkeletonBlock className="h-3 w-16 max-w-full" />
              <SkeletonBlock className="mt-3 h-5 w-20 max-w-full" />
              <SkeletonBlock className="mt-2 h-3 w-14 max-w-full" />
            </div>
          ))}
        </div>
      </div>
      <div className="rounded-xl border border-[var(--line)] p-4">
        <SkeletonBlock className="h-5 w-28" />
        <SkeletonBlock className="mt-3 h-4 w-36" />
        <div className="mt-3 grid grid-cols-2 gap-3">
          <SkeletonBlock className="h-16 rounded-lg" />
          <SkeletonBlock className="h-16 rounded-lg" />
        </div>
      </div>
      <div className="flex justify-end">
        <SkeletonBlock className="h-9 w-32 rounded-lg" />
      </div>
    </article>
  );
}

export default function ProDashboard({ token }) {
  const [dashboard, setDashboard] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [city, setCity] = useState("");
  const [country, setCountry] = useState("");
  const [label, setLabel] = useState("Home");
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState(null);
  const [notice, setNotice] = useState("");
  const [confirmLocation, setConfirmLocation] = useState(null);
  const [selectedInsightId, setSelectedInsightId] = useState("");
  const [citySuggestions, setCitySuggestions] = useState([]);
  const [citySearchLoading, setCitySearchLoading] = useState(false);
  const [showCitySuggestions, setShowCitySuggestions] = useState(false);

  const loadDashboard = useCallback(
    async ({ showLoading = true } = {}) => {
      if (!token) {
        setError("Please sign in to access your Pro Dashboard.");
        setLoading(false);
        return;
      }

      if (showLoading) setLoading(true);
      else setRefreshing(true);

      setError("");

      try {
        const result = await getProDashboard(token);
        setDashboard(result.dashboard);
        const options = result.dashboard?.dailyInsight?.options || [];
        setSelectedInsightId((current) =>
          options.some((option) => option.locationId === current)
            ? current
            : options[0]?.locationId || "",
        );
      } catch (err) {
        setError(err.message || "Unable to load the Pro Dashboard.");
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [token],
  );

  useEffect(() => {
    loadDashboard();
  }, [loadDashboard]);

  useEffect(() => {
    if (!notice) return undefined;
    const timeoutId = window.setTimeout(() => setNotice(""), 3500);
    return () => window.clearTimeout(timeoutId);
  }, [notice]);

  // Search a global geocoding service so suggestions are not limited to a hardcoded list.
  useEffect(() => {
    const query = city.trim();
    if (query.length < 2 || !showCitySuggestions) {
      setCitySuggestions([]);
      setCitySearchLoading(false);
      return undefined;
    }

    const controller = new AbortController();
    const timeoutId = window.setTimeout(async () => {
      setCitySearchLoading(true);
      try {
        const params = new URLSearchParams({
          name: query,
          count: "8",
          language: "en",
          format: "json",
        });
        const response = await fetch(
          `https://geocoding-api.open-meteo.com/v1/search?${params}`,
          { signal: controller.signal },
        );
        if (!response.ok) throw new Error("City search unavailable");
        const data = await response.json();
        setCitySuggestions(
          (data.results || []).map((item) => ({
            name: item.name,
            country: item.country || "",
            admin1: item.admin1 || "",
            id: `${item.id}-${item.latitude}-${item.longitude}`,
          })),
        );
      } catch (err) {
        if (err.name !== "AbortError") setCitySuggestions([]);
      } finally {
        if (!controller.signal.aborted) setCitySearchLoading(false);
      }
    }, 300);

    return () => {
      window.clearTimeout(timeoutId);
      controller.abort();
    };
  }, [city, showCitySuggestions]);

  async function handleSaveLocation(event) {
    event.preventDefault();
    setError("");
    setNotice("");

    if (!city.trim()) {
      setError("Please enter a city name.");
      return;
    }

    setSaving(true);

    try {
      await saveProLocation(token, {
        city: city.trim(),
        label: label.trim() || "Home",
        country: country.trim() || null,
      });

      setCity("");
      setCountry("");
      setLabel("Home");
      setNotice("Location saved successfully.");
      await loadDashboard({ showLoading: false });
    } catch (err) {
      setError(err.message || "Unable to save location.");
    } finally {
      setSaving(false);
    }
  }

  async function handleDeleteLocation(location) {
    setError("");
    setNotice("");
    setDeletingId(location.id);

    try {
      await deleteProLocation(token, location.id);
      setConfirmLocation(null);
      setNotice(
        `${location.city}${location.country ? `, ${location.country}` : ""} was removed from your saved locations.`,
      );
      await loadDashboard({ showLoading: false });
    } catch (err) {
      setError(
        err.message || "Unable to remove this location. Please try again.",
      );
    } finally {
      setDeletingId(null);
    }
  }

  if (loading) {
    return (
      <section
        className="mx-auto max-w-7xl space-y-6 p-4 sm:p-6"
        aria-busy="true"
        aria-label="Loading Pro Dashboard"
      >
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="w-full max-w-lg space-y-3">
            <SkeletonBlock className="h-4 w-44" />
            <SkeletonBlock className="h-9 w-64 max-w-full" />
            <SkeletonBlock className="h-4 w-full max-w-md" />
          </div>
          <SkeletonBlock className="h-10 w-28 rounded-xl" />
        </div>

        <div className="rounded-2xl border border-[var(--line)] bg-white p-5 sm:p-6">
          <SkeletonBlock className="h-4 w-36" />
          <SkeletonBlock className="mt-4 h-6 w-64 max-w-full" />
          <SkeletonBlock className="mt-3 h-4 w-full" />
          <SkeletonBlock className="mt-2 h-4 w-5/6" />
          <SkeletonBlock className="mt-2 h-4 w-2/3" />
        </div>

        <div className="rounded-2xl border border-[var(--line)] bg-white p-5">
          <SkeletonBlock className="h-6 w-52" />
          <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {Array.from({ length: 4 }, (_, index) => (
              <div key={index} className="space-y-2">
                <SkeletonBlock className="h-4 w-20" />
                <SkeletonBlock className="h-11 w-full rounded-xl" />
              </div>
            ))}
          </div>
        </div>

        <div className="space-y-4">
          <div className="flex items-center justify-between gap-3">
            <SkeletonBlock className="h-7 w-48" />
            <SkeletonBlock className="h-4 w-20" />
          </div>
          <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
            {Array.from({ length: 2 }, (_, index) => (
              <WeatherCardSkeleton key={index} />
            ))}
          </div>
        </div>
        <p className="sr-only">Loading your Pro Dashboard…</p>
      </section>
    );
  }

  return (
    <section className="mx-auto max-w-7xl space-y-6 p-4 sm:p-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm font-medium text-[var(--info-text)]">
            BTP Weather Assistant
          </p>
          <h1 className="mt-1 text-3xl font-bold text-[var(--ink-900)]">
            Pro Dashboard
          </h1>
          <p className="mt-2 text-[var(--ink-600)]">
            Your saved locations, forecasts, and daily weather insight.
          </p>
        </div>

        <button
          type="button"
          onClick={() => loadDashboard({ showLoading: false })}
          disabled={refreshing}
          className="rounded-xl border border-[var(--line)] px-4 py-2 font-medium text-[var(--ink-600)] hover:bg-[var(--bg-soft)] disabled:opacity-50"
        >
          {refreshing ? "Refreshing…" : "Refresh"}
        </button>
      </header>

      {error && (
        <div
          role="alert"
          className="rounded-xl border border-[var(--danger)] bg-[var(--bg-soft)] p-4 text-sm text-[var(--danger)]"
        >
          {error}
        </div>
      )}

      {notice && (
        <div
          role="status"
          aria-live="polite"
          className="fixed right-4 top-4 z-50 flex max-w-md items-start gap-3 rounded-2xl border border-[var(--success)] bg-white px-4 py-3 shadow-xl shadow-black/5"
        >
          <span
            className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[var(--teal-100)] text-[var(--success)]"
            aria-hidden="true"
          >
            ✓
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-[var(--ink-900)]">
              Success
            </p>
            <p className="mt-0.5 text-sm text-[var(--ink-600)]">{notice}</p>
          </div>
          <button
            type="button"
            onClick={() => setNotice("")}
            aria-label="Dismiss notification"
            className="rounded-md px-1 text-lg leading-5 text-[var(--ink-400)] hover:bg-[var(--teal-50)] hover:text-[var(--ink-600)]"
          >
            ×
          </button>
        </div>
      )}

      {dashboard?.locations?.length > 0 && (
        <article className="rounded-2xl border border-[var(--info-border)] bg-[var(--info-bg)] p-5 sm:p-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-sm font-semibold text-[var(--info-text)]">
                DAILY AI INSIGHT
              </p>
              <h2 className="mt-1 text-xl font-semibold text-[var(--ink-900)]">
                Weather outlook
              </h2>
            </div>
            {(dashboard?.dailyInsight?.options?.length || 0) > 0 && (
              <label className="text-sm font-medium text-[var(--ink-600)]">
                <span className="sr-only">Choose a city insight</span>
                <select
                  value={selectedInsightId}
                  onChange={(event) => setSelectedInsightId(event.target.value)}
                  className="max-w-full rounded-full border border-[var(--line)] bg-white px-3 py-2 text-sm outline-none focus:border-[var(--teal-700)] focus:ring-2 focus:ring-[var(--teal-100)]"
                >
                  {dashboard.dailyInsight.options.map((option) => (
                    <option key={option.locationId} value={option.locationId}>
                      {option.city}
                    </option>
                  ))}
                </select>
              </label>
            )}
          </div>
          {(dashboard?.dailyInsight?.options?.length || 0) > 0 ? (
            <>
              <p className="mt-3 leading-6 text-[var(--ink-600)]">
                {dashboard.dailyInsight.options.find(
                  (option) => option.locationId === selectedInsightId,
                )?.text || dashboard.dailyInsight.options[0].text}
              </p>
              <p className="mt-3 text-xs text-[var(--ink-600)]">
                Daily insight ·{" "}
                {formatDate(
                  String(dashboard.dailyInsight.date || "").slice(0, 10),
                )}
              </p>
            </>
          ) : (
            <p className="mt-3 text-sm text-[var(--ink-600)]">
              AI insight is not available yet. Check the backend terminal for an
              AI provider error, then click Refresh.
            </p>
          )}
        </article>
      )}

      <article className="rounded-2xl border border-[var(--line)] bg-white p-5">
        <h2 className="text-xl font-semibold text-[var(--ink-900)]">
          Add a saved location
        </h2>

        <form
          onSubmit={handleSaveLocation}
          className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4"
        >
          <label className="text-sm font-medium text-[var(--ink-600)]">
            City *
            <div className="relative mt-1">
              <input
                value={city}
                onFocus={() => setShowCitySuggestions(true)}
                onChange={(event) => {
                  setCity(event.target.value);
                  setCountry("");
                  setShowCitySuggestions(true);
                }}
                onBlur={() =>
                  window.setTimeout(() => setShowCitySuggestions(false), 150)
                }
                maxLength={100}
                required
                placeholder="Search any city…"
                autoComplete="off"
                aria-autocomplete="list"
                aria-expanded={showCitySuggestions && city.trim().length >= 2}
                className="w-full rounded-full border border-[var(--line)] px-3 py-2.5 outline-none focus:border-[var(--teal-700)] focus:ring-2 focus:ring-[var(--teal-100)]"
              />
              {showCitySuggestions && city.trim().length >= 2 && (
                <div className="absolute z-20 mt-1 max-h-64 w-full overflow-y-auto rounded-xl border border-[var(--line)] bg-white py-1 shadow-lg">
                  {citySearchLoading ? (
                    <p className="px-3 py-2 text-sm text-[var(--ink-600)]">
                      Searching cities…
                    </p>
                  ) : citySuggestions.length > 0 ? (
                    citySuggestions.map((suggestion) => (
                      <button
                        key={suggestion.id}
                        type="button"
                        onMouseDown={(event) => event.preventDefault()}
                        onClick={() => {
                          setCity(suggestion.name);
                          setCountry(suggestion.country);
                          setShowCitySuggestions(false);
                          setCitySuggestions([]);
                        }}
                        className="block w-full px-3 py-2 text-left text-sm hover:bg-[var(--info-bg)]"
                      >
                        <span className="block font-medium text-[var(--ink-900)]">
                          {suggestion.name}
                        </span>
                        <span className="block text-xs text-[var(--ink-600)]">
                          {[suggestion.admin1, suggestion.country]
                            .filter(Boolean)
                            .join(", ")}
                        </span>
                      </button>
                    ))
                  ) : (
                    <p className="px-3 py-2 text-sm text-[var(--ink-600)]">
                      No matches. You can still enter the city name manually.
                    </p>
                  )}
                </div>
              )}
            </div>
          </label>

          <label className="text-sm font-medium text-[var(--ink-600)]">
            Country
            <input
              value={country}
              onChange={(event) => setCountry(event.target.value)}
              maxLength={100}
              placeholder="e.g. Pakistan"
              className="mt-1 w-full rounded-full border border-[var(--line)] px-3 py-2.5 outline-none focus:border-[var(--teal-700)] focus:ring-2 focus:ring-[var(--teal-100)]"
            />
          </label>

          <label className="text-sm font-medium text-[var(--ink-600)]">
            Label
            <input
              value={label}
              onChange={(event) => setLabel(event.target.value)}
              maxLength={50}
              required
              placeholder="Home or Office"
              className="mt-1 w-full rounded-full border border-[var(--line)] px-3 py-2.5 outline-none focus:border-[var(--teal-700)] focus:ring-2 focus:ring-[var(--teal-100)]"
            />
          </label>

          <div className="flex items-end">
            <button
              type="submit"
              disabled={saving || !token}
              className="w-full rounded-full bg-[var(--teal-700)] px-4 py-2.5 font-semibold text-white hover:bg-[var(--teal-600)] disabled:cursor-not-allowed disabled:opacity-50"
            >
              {saving ? "Saving…" : "Add location"}
            </button>
          </div>
        </form>
      </article>

      <div>
        <div className="mb-4 flex items-center justify-between gap-3">
          <h2 className="text-2xl font-bold text-[var(--ink-900)]">
            Saved locations
          </h2>
          <span className="text-sm text-[var(--ink-600)]">
            {dashboard?.locations?.length || 0} saved
          </span>
        </div>

        {!dashboard?.locations?.length ? (
          <div className="rounded-2xl border border-dashed border-[var(--line)] bg-white p-8 text-center">
            <h3 className="text-lg font-semibold text-[var(--ink-900)]">
              No saved locations yet
            </h3>
            <p className="mt-2 text-sm text-[var(--ink-600)]">
              Add a city above to see its current weather, forecast, and air
              quality.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
            {dashboard.locations.map((location) => (
              <div key={location.id}>
                <WeatherCard
                  location={location}
                  onRemove={() => setConfirmLocation(location)}
                  removing={deletingId === location.id}
                />
              </div>
            ))}
          </div>
        )}
      </div>

      {confirmLocation && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-[rgba(6,59,64,0.4)] p-4 backdrop-blur-sm"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget && !deletingId)
              setConfirmLocation(null);
          }}
        >
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="remove-location-title"
            aria-describedby="remove-location-description"
            className="w-full max-w-md rounded-2xl border border-[var(--line)] bg-white p-6 shadow-2xl"
          >
            <div className="flex items-start gap-3">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[var(--bg-soft)] text-[var(--danger)]">
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  className="h-5 w-5"
                  aria-hidden="true"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M3 6h18M9 6V4h6v2m-9 0 1 14h10l1-14M10 10v6m4-6v6"
                  />
                </svg>
              </div>
              <div>
                <h2
                  id="remove-location-title"
                  className="text-lg font-semibold text-[var(--ink-900)]"
                >
                  Remove saved location?
                </h2>
                <p
                  id="remove-location-description"
                  className="mt-2 text-sm leading-6 text-[var(--ink-600)]"
                >
                  Are you sure you want to remove{" "}
                  <span className="font-semibold text-[var(--ink-900)]">
                    {confirmLocation.city}
                    {confirmLocation.country
                      ? `, ${confirmLocation.country}`
                      : ""}
                  </span>
                  ? It will no longer appear on your Pro Dashboard.
                </p>
              </div>
            </div>
            <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
              <button
                type="button"
                disabled={Boolean(deletingId)}
                onClick={() => setConfirmLocation(null)}
                className="rounded-xl border border-[var(--line)] px-4 py-2.5 text-sm font-semibold text-[var(--ink-600)] transition hover:bg-[var(--bg-soft)] disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={Boolean(deletingId)}
                onClick={() => handleDeleteLocation(confirmLocation)}
                className="rounded-xl bg-[var(--danger)] px-4 py-2.5 text-sm font-semibold text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {deletingId === confirmLocation.id
                  ? "Removing…"
                  : "Yes, remove location"}
              </button>
            </div>
          </section>
        </div>
      )}
    </section>
  );
}
