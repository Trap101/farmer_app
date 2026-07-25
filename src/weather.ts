// Open-Meteo client. No API key, no HTTP library — Node's global fetch.
//
// One request covers both the scouting history and the forecast: the forecast
// endpoint accepts past_days (0-93) and forecast_days (0-16) together and returns a
// single contiguous daily series. Verified against the live API; the documented
// past_days ceiling of 92 is actually enforced at 93.
//
// Docs: https://open-meteo.com/en/docs

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { DailyWeather } from "./types.ts";

const BASE = "https://api.open-meteo.com/v1/forecast";
const CACHE_DIR = ".cache";

/** Free tier: 600 calls/min, 10,000/day, but calls are weighted by span — a
 *  request over more than two weeks bills as several. A 30+16 day window costs
 *  roughly 3-4 calls, so the real budget is nearer 2,500 field-requests/day.
 *  Source models refresh every 1-3 h, so a few hours of cache costs no accuracy. */
const CACHE_TTL_MS = 3 * 60 * 60 * 1000;

/** Grid-snap the coordinates before they become a cache key. Open-Meteo resolves
 *  to its model grid anyway (44.98/-93.26 comes back as 44.969/-93.263), so
 *  rounding to ~0.05° dedupes neighbouring fields for free. */
function cacheKey(lat: number, lon: number, pastDays: number, forecastDays: number): string {
  const r = (x: number) => (Math.round(x * 20) / 20).toFixed(2);
  return `om_${r(lat)}_${r(lon)}_${pastDays}_${forecastDays}.json`;
}

async function readCache(path: string): Promise<DailyWeather | null> {
  try {
    const raw = await readFile(path, "utf8");
    const { at, data } = JSON.parse(raw) as { at: number; data: DailyWeather };
    if (Date.now() - at > CACHE_TTL_MS) return null;
    return data;
  } catch {
    return null;
  }
}

/** Daily min/max temperature, history plus forecast, in Celsius. */
export async function fetchWeather(
  lat: number,
  lon: number,
  pastDays = 45,
  forecastDays = 16,
): Promise<DailyWeather> {
  const past = Math.min(Math.max(pastDays, 0), 93);
  const fwd = Math.min(Math.max(forecastDays, 0), 16);

  const path = join(CACHE_DIR, cacheKey(lat, lon, past, fwd));
  const cached = await readCache(path);
  if (cached) return cached;

  const url =
    `${BASE}?latitude=${lat}&longitude=${lon}` +
    `&daily=temperature_2m_max,temperature_2m_min&timezone=auto` +
    `&past_days=${past}&forecast_days=${fwd}`;

  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Open-Meteo ${res.status}: ${await res.text()}`);
  }
  const body = (await res.json()) as {
    daily_units?: Record<string, string>;
    daily: DailyWeather;
  };

  // The API honours &temperature_unit=fahrenheit and echoes the choice back. We
  // never ask for it, but check rather than assume — every constant downstream is
  // in Celsius and a silent unit flip would be invisible and badly wrong.
  const unit = body.daily_units?.temperature_2m_max;
  if (unit && !unit.includes("C")) {
    throw new Error(`Expected Celsius from Open-Meteo, got ${unit}`);
  }

  const data = normalise(body.daily);
  await mkdir(CACHE_DIR, { recursive: true }).catch(() => {});
  await writeFile(path, JSON.stringify({ at: Date.now(), data })).catch(() => {});
  return data;
}

/** Drop days with a missing temperature.
 *
 *  No nulls were observed in testing, but the arrays are index-aligned to `time`
 *  and a single null would silently poison the degree-day accumulation rather than
 *  throwing, so they are filtered rather than trusted. */
export function normalise(d: DailyWeather): DailyWeather {
  const time: string[] = [];
  const tmax: number[] = [];
  const tmin: number[] = [];
  for (let i = 0; i < d.time.length; i++) {
    const a = d.temperature_2m_max[i];
    const b = d.temperature_2m_min[i];
    if (a == null || b == null || !Number.isFinite(a) || !Number.isFinite(b)) continue;
    time.push(d.time[i]);
    tmax.push(a);
    tmin.push(b);
  }
  return { time, temperature_2m_max: tmax, temperature_2m_min: tmin };
}
