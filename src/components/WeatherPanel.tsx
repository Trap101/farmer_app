import { useEffect, useState } from 'react'

// Open-Meteo (free, no API key) — Fresno, CA (Central Valley)
const WEATHER_URL =
  'https://api.open-meteo.com/v1/forecast' +
  '?latitude=36.7378&longitude=-119.7871' +
  '&current=temperature_2m,relative_humidity_2m,apparent_temperature,precipitation,wind_speed_10m,wind_direction_10m,wind_gusts_10m,weather_code' +
  '&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max,wind_speed_10m_max' +
  '&forecast_days=5&timezone=America%2FLos_Angeles' +
  '&temperature_unit=fahrenheit&wind_speed_unit=mph&precipitation_unit=inch'

interface CurrentWeather {
  temperature_2m: number
  relative_humidity_2m: number
  apparent_temperature: number
  precipitation: number
  wind_speed_10m: number
  wind_direction_10m: number
  wind_gusts_10m: number
  weather_code: number
}

interface DailyWeather {
  time: string[]
  weather_code: number[]
  temperature_2m_max: number[]
  temperature_2m_min: number[]
  precipitation_probability_max: number[]
  wind_speed_10m_max: number[]
}

interface WeatherResponse {
  current: CurrentWeather
  daily: DailyWeather
}

const WMO_ICONS: Array<[Set<number>, string, string]> = [
  [new Set([0]), '☀️', 'Clear'],
  [new Set([1, 2]), '🌤️', 'Mostly clear'],
  [new Set([3]), '☁️', 'Overcast'],
  [new Set([45, 48]), '🌫️', 'Fog'],
  [new Set([51, 53, 55, 56, 57]), '🌦️', 'Drizzle'],
  [new Set([61, 63, 65, 66, 67, 80, 81, 82]), '🌧️', 'Rain'],
  [new Set([71, 73, 75, 77, 85, 86]), '🌨️', 'Snow'],
  [new Set([95, 96, 99]), '⛈️', 'Thunderstorm'],
]

function wmoInfo(code: number): { icon: string; label: string } {
  for (const [codes, icon, label] of WMO_ICONS) {
    if (codes.has(code)) return { icon, label }
  }
  return { icon: '🌡️', label: '—' }
}

function windCompass(deg: number): string {
  const dirs = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW']
  return dirs[Math.round(deg / 45) % 8]
}

// Simple agronomic heuristic shown as a hint chip: spraying is
// discouraged in high wind (drift) or when rain is imminent (washoff).
function sprayCondition(current: CurrentWeather): {
  label: string
  tone: 'good' | 'caution' | 'bad'
} {
  if (current.wind_speed_10m > 10 || current.precipitation > 0)
    return { label: 'Poor spray conditions', tone: 'bad' }
  if (current.wind_speed_10m > 7 || current.relative_humidity_2m < 40)
    return { label: 'Marginal spray conditions', tone: 'caution' }
  return { label: 'Good spray conditions', tone: 'good' }
}

export function WeatherPanel() {
  const [data, setData] = useState<WeatherResponse | null>(null)
  const [error, setError] = useState(false)
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null)

  useEffect(() => {
    let cancelled = false

    async function load() {
      try {
        const res = await fetch(WEATHER_URL)
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        const json: WeatherResponse = await res.json()
        if (!cancelled) {
          setData(json)
          setError(false)
          setUpdatedAt(new Date())
        }
      } catch {
        if (!cancelled) setError(true)
      }
    }

    load()
    const t = setInterval(load, 60_000) // refresh every minute — "live"
    return () => {
      cancelled = true
      clearInterval(t)
    }
  }, [])

  if (error && !data) {
    return (
      <section className="panel weather-panel">
        <div className="panel-header">
          <h3>Weather · Fresno, CA</h3>
        </div>
        <p className="weather-error">
          Couldn't reach the weather service. Check your connection — retrying
          every minute.
        </p>
      </section>
    )
  }

  if (!data) {
    return (
      <section className="panel weather-panel">
        <div className="panel-header">
          <h3>Weather · Fresno, CA</h3>
        </div>
        <div className="weather-loading">
          <span className="spinner" aria-hidden />
          Fetching live conditions…
        </div>
      </section>
    )
  }

  const { current, daily } = data
  const now = wmoInfo(current.weather_code)
  const spray = sprayCondition(current)

  return (
    <section className="panel weather-panel">
      <div className="panel-header">
        <h3>Weather · Fresno, CA</h3>
        <span className="live-badge live-badge-green">
          <span className="live-dot" aria-hidden />
          {updatedAt
            ? `Updated ${updatedAt.toLocaleTimeString('en-US', { hour12: false })}`
            : 'LIVE'}
        </span>
      </div>

      <div className="weather-now">
        <div className="weather-temp">
          <span className="weather-icon" aria-hidden>
            {now.icon}
          </span>
          <div>
            <span className="weather-degrees">
              {Math.round(current.temperature_2m)}°F
            </span>
            <span className="weather-label">
              {now.label} · feels {Math.round(current.apparent_temperature)}°
            </span>
          </div>
        </div>
        <span className={`spray-chip spray-${spray.tone}`}>{spray.label}</span>
      </div>

      <div className="weather-metrics">
        <div className="metric">
          <span className="metric-label">Wind</span>
          <span className="metric-value">
            {Math.round(current.wind_speed_10m)} mph{' '}
            {windCompass(current.wind_direction_10m)}
          </span>
          <span className="metric-sub">
            gusts {Math.round(current.wind_gusts_10m)} mph
          </span>
        </div>
        <div className="metric">
          <span className="metric-label">Humidity</span>
          <span className="metric-value">{current.relative_humidity_2m}%</span>
          <span className="metric-sub">relative</span>
        </div>
        <div className="metric">
          <span className="metric-label">Precip</span>
          <span className="metric-value">
            {current.precipitation.toFixed(2)}″
          </span>
          <span className="metric-sub">last hour</span>
        </div>
      </div>

      <div className="forecast">
        {daily.time.map((day, i) => {
          const info = wmoInfo(daily.weather_code[i])
          const weekday =
            i === 0
              ? 'Today'
              : new Date(day + 'T12:00:00').toLocaleDateString('en-US', {
                  weekday: 'short',
                })
          return (
            <div className="forecast-day" key={day}>
              <span className="forecast-name">{weekday}</span>
              <span className="forecast-icon" aria-hidden>
                {info.icon}
              </span>
              <span className="forecast-temps">
                {Math.round(daily.temperature_2m_max[i])}°
                <span className="forecast-low">
                  {Math.round(daily.temperature_2m_min[i])}°
                </span>
              </span>
              <span className="forecast-rain">
                💧 {daily.precipitation_probability_max[i]}%
              </span>
            </div>
          )
        })}
      </div>
    </section>
  )
}
