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

function WeatherCard({ location }) {
  const current = location.currentWeather;
  const air = location.airQuality;

  return (
    <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-sm text-slate-500">{location.label}</p>
          <h3 className="text-xl font-semibold text-slate-900">
            {location.city}
            {location.country ? `, ${location.country}` : ""}
          </h3>
        </div>

        <span className="rounded-full bg-sky-50 px-3 py-1 text-xs font-medium text-sky-700">
          {location.cached ? "Cached" : "Live"}
        </span>
      </div>

      {location.weatherError ? (
        <p className="mt-4 rounded-lg bg-amber-50 p-3 text-sm text-amber-800">
          {location.weatherError}
        </p>
      ) : (
        <>
          {current && (
            <div className="mt-5">
              <p className="text-4xl font-bold text-slate-900">
                {Math.round(current.temperatureC)}°C
              </p>
              <p className="mt-1 capitalize text-slate-600">
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
            <h4 className="font-semibold text-slate-900">Five-day forecast</h4>

            {location.forecast?.length ? (
              <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
                {location.forecast.map((day) => (
                  <div key={day.date} className="rounded-xl bg-slate-50 p-3">
                    <p className="text-xs text-slate-500">
                      {formatDate(day.date)}
                    </p>
                    <p className="mt-2 font-semibold text-slate-900">
                      {Math.round(day.maxTemperatureC)}° /{" "}
                      {Math.round(day.minTemperatureC)}°
                    </p>
                    <p className="mt-1 text-xs text-slate-600">
                      Rain: {day.rainProbability}%
                    </p>
                  </div>
                ))}
              </div>
            ) : (
              <p className="mt-2 text-sm text-slate-500">
                Forecast unavailable.
              </p>
            )}
          </div>

          <div className="mt-5 rounded-xl border border-slate-200 p-4">
            <h4 className="font-semibold text-slate-900">Air quality</h4>

            {air ? (
              <>
                <p className="mt-1 text-sm text-slate-700">
                  {air.label} (AQI {air.index})
                </p>
                <div className="mt-3 grid grid-cols-2 gap-3">
                  <Metric label="PM2.5" value={`${air.pm2_5} µg/m³`} />
                  <Metric label="PM10" value={`${air.pm10} µg/m³`} />
                </div>
              </>
            ) : (
              <p className="mt-2 text-sm text-slate-500">
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
    <div className="rounded-lg bg-slate-50 p-3">
      <p className="text-xs text-slate-500">{label}</p>
      <p className="mt-1 font-semibold text-slate-900">{value}</p>
    </div>
  );
}

function SkeletonBlock({ className = "" }) {
  return (
    <div
      aria-hidden="true"
      className={`animate-pulse rounded-md bg-slate-200 ${className}`}
    />
  );
}

function WeatherCardSkeleton() {
  return (
    <article
      aria-hidden="true"
      className="space-y-5 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"
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
            <div key={index} className="rounded-lg bg-slate-50 p-3">
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
            <div key={index} className="rounded-xl bg-slate-50 p-3">
              <SkeletonBlock className="h-3 w-16 max-w-full" />
              <SkeletonBlock className="mt-3 h-5 w-20 max-w-full" />
              <SkeletonBlock className="mt-2 h-3 w-14 max-w-full" />
            </div>
          ))}
        </div>
      </div>
      <div className="rounded-xl border border-slate-200 p-4">
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
    const confirmed = window.confirm(
      `Remove ${location.city} from your saved locations?`,
    );

    if (!confirmed) return;

    setError("");
    setNotice("");
    setDeletingId(location.id);

    try {
      await deleteProLocation(token, location.id);
      setNotice(`${location.city} was removed.`);
      await loadDashboard({ showLoading: false });
    } catch (err) {
      setError(err.message || "Unable to delete location.");
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

        <div className="rounded-2xl border border-slate-200 bg-white p-5 sm:p-6">
          <SkeletonBlock className="h-4 w-36" />
          <SkeletonBlock className="mt-4 h-6 w-64 max-w-full" />
          <SkeletonBlock className="mt-3 h-4 w-full" />
          <SkeletonBlock className="mt-2 h-4 w-5/6" />
          <SkeletonBlock className="mt-2 h-4 w-2/3" />
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-5">
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
          <p className="text-sm font-medium text-sky-700">
            BTP Weather Assistant
          </p>
          <h1 className="mt-1 text-3xl font-bold text-slate-900">
            Pro Dashboard
          </h1>
          <p className="mt-2 text-slate-600">
            Your saved locations, forecasts, and daily weather insight.
          </p>
        </div>

        <button
          type="button"
          onClick={() => loadDashboard({ showLoading: false })}
          disabled={refreshing}
          className="rounded-xl border border-slate-300 px-4 py-2 font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
        >
          {refreshing ? "Refreshing…" : "Refresh"}
        </button>
      </header>

      {error && (
        <div
          role="alert"
          className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700"
        >
          {error}
        </div>
      )}

      {notice && (
        <div
          role="status"
          className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800"
        >
          {notice}
        </div>
      )}

      {dashboard?.dailyInsight && (
        <article className="rounded-2xl border border-sky-200 bg-sky-50 p-5 sm:p-6">
          <p className="text-sm font-semibold text-sky-800">DAILY AI INSIGHT</p>
          <h2 className="mt-2 text-xl font-semibold text-slate-900">
            Today's weather outlook
          </h2>
          <p className="mt-3 whitespace-pre-line leading-7 text-slate-700">
            {dashboard.dailyInsight.text}
          </p>
          {dashboard.dailyInsight.date && (
            <p className="mt-3 text-xs text-slate-500">
              Insight date:{" "}
              {formatDate(String(dashboard.dailyInsight.date).slice(0, 10))}
            </p>
          )}
        </article>
      )}

      <article className="rounded-2xl border border-slate-200 bg-white p-5">
        <h2 className="text-xl font-semibold text-slate-900">
          Add a saved location
        </h2>

        <form
          onSubmit={handleSaveLocation}
          className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4"
        >
          <label className="text-sm font-medium text-slate-700">
            City *
            <input
              value={city}
              onChange={(event) => setCity(event.target.value)}
              maxLength={100}
              required
              placeholder="e.g. Lahore"
              className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2.5 outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-100"
            />
          </label>

          <label className="text-sm font-medium text-slate-700">
            Country
            <input
              value={country}
              onChange={(event) => setCountry(event.target.value)}
              maxLength={100}
              placeholder="e.g. Pakistan"
              className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2.5 outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-100"
            />
          </label>

          <label className="text-sm font-medium text-slate-700">
            Label
            <input
              value={label}
              onChange={(event) => setLabel(event.target.value)}
              maxLength={50}
              required
              placeholder="Home or Office"
              className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2.5 outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-100"
            />
          </label>

          <div className="flex items-end">
            <button
              type="submit"
              disabled={saving || !token}
              className="w-full rounded-xl bg-sky-600 px-4 py-2.5 font-semibold text-white hover:bg-sky-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {saving ? "Saving…" : "Add location"}
            </button>
          </div>
        </form>
      </article>

      <div>
        <div className="mb-4 flex items-center justify-between gap-3">
          <h2 className="text-2xl font-bold text-slate-900">Saved locations</h2>
          <span className="text-sm text-slate-500">
            {dashboard?.locations?.length || 0} saved
          </span>
        </div>

        {!dashboard?.locations?.length ? (
          <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center">
            <h3 className="text-lg font-semibold text-slate-900">
              No saved locations yet
            </h3>
            <p className="mt-2 text-sm text-slate-600">
              Add a city above to see its current weather, forecast, and air
              quality.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
            {dashboard.locations.map((location) => (
              <div key={location.id} className="space-y-3">
                <WeatherCard location={location} />

                <div className="flex justify-end">
                  <button
                    type="button"
                    onClick={() => handleDeleteLocation(location)}
                    disabled={deletingId === location.id}
                    className="rounded-lg border border-red-200 px-3 py-2 text-sm font-medium text-red-700 hover:bg-red-50 disabled:opacity-50"
                  >
                    {deletingId === location.id
                      ? "Removing…"
                      : "Remove location"}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
