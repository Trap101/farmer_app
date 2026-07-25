// Browser client for the forecast engine (src/server.ts, port 8787).
//
// Vite proxies /api -> :8787 (see vite.config.ts), so this stays same-origin
// and the engine's open CORS is not load-bearing in the demo.
//
// Types come straight from src/types.ts — the engine's own contract, shared
// rather than re-declared. That file has no runtime exports, so `import type`
// erases entirely and no Node code reaches the browser bundle. Keep every
// import of it `type`-marked; a value import would break both sides at once
// (BACKEND.md, landmine 3).

import type { Observation, Forecast, ScoutingSheet, ReasonCode } from './types'

export type { Observation, Forecast, ScoutingSheet, ReasonCode }

// Three deployments, three bases:
//   dev            -> '/api', the Vite proxy to localhost:8787 (vite.config.ts)
//   render         -> '', same origin: spraysense.onrender.com serves both the
//                     built frontend and the API, so relative paths just work
//   vercel / split -> set VITE_ENGINE_ORIGIN to the engine's origin, which makes
//                     the calls cross-origin and leans on the engine's open CORS
//
// Point local dev at the deployed engine (which has GEMINI_API_KEY) with:
//   ENGINE_ORIGIN=https://spraysense.onrender.com npm run dev
const BASE = import.meta.env.VITE_ENGINE_ORIGIN ?? (import.meta.env.DEV ? '/api' : '')

async function post<T>(path: string, body: unknown): Promise<T> {
  let res: Response
  try {
    res = await fetch(BASE + path, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    })
  } catch {
    // fetch rejects with a bare "Failed to fetch" for DNS, refused connections
    // and CORS alike — useless on a stage. Name the thing that is actually down.
    throw new Error(
      `Can't reach the forecast engine at ${BASE || window.location.origin}. ` +
        `Check it's running and that VITE_ENGINE_ORIGIN is set for this build.`,
    )
  }
  // The engine reports failures as {"error": "..."} with a 4xx — surface that
  // text rather than a bare status, it is written to be read by a person.
  const json = await res.json().catch(() => null)
  if (!res.ok) {
    throw new Error(json?.error ?? `Request failed (${res.status})`)
  }
  return json as T
}

/** The blank printable sheet, served by the engine from scouting-form.html. */
export const FORM_URL = `${BASE}/form`

export interface ForecastRequest {
  lat: number
  lon: number
  crop_price: number
  spray_cost_per_acre: number
  yield_potential_bu_ac?: number
  /** Pinning this keeps the Monte Carlo reproducible across demo runs. */
  seed?: number
  observations: Observation[]
}

export function runForecast(req: ForecastRequest): Promise<Forecast> {
  return post<Forecast>('/forecast', req)
}

export interface ScoutOcrResponse {
  sheet: ScoutingSheet
  /** null when the sheet is missing something the engine cannot run without. */
  observation: Observation | null
  warnings: string[]
}

export function scoutOcr(
  imageBase64: string,
  mimeType: string,
): Promise<ScoutOcrResponse> {
  return post<ScoutOcrResponse>('/scout/ocr', {
    image_base64: imageBase64,
    mime_type: mimeType,
    pest: 'aphid',
  })
}

/** Strips the `data:image/jpeg;base64,` prefix the server also tolerates. */
export function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result).replace(/^data:[^,]*,/, ''))
    reader.onerror = () => reject(new Error('Could not read that image'))
    reader.readAsDataURL(file)
  })
}

/**
 * Only ABOVE_THRESHOLD means spray today; CROSSING_SOON means book a sprayer
 * for recommended_action_date and do not spray now. Every other code must not
 * offer a booking action even when the engine returns a non-null date —
 * BELOW_THRESHOLD does exactly that. See BACKEND.md.
 */
export function canBookSprayer(f: Forecast): boolean {
  return (
    f.recommended_action_date !== null &&
    (f.reason_code === 'CROSSING_SOON' || f.reason_code === 'ABOVE_THRESHOLD')
  )
}

export function toneFor(code: ReasonCode): 'good' | 'caution' | 'bad' | 'neutral' {
  switch (code) {
    case 'ABOVE_THRESHOLD':
      return 'bad'
    case 'CROSSING_SOON':
      return 'caution'
    case 'BELOW_THRESHOLD':
    case 'PREDATOR_SUPPRESSED':
    case 'STAGE_PAST_BENEFIT':
      return 'good'
    case 'INSUFFICIENT_DATA':
    case 'IMPLAUSIBLE_GROWTH':
      return 'neutral'
  }
}

export const REASON_LABEL: Record<ReasonCode, string> = {
  BELOW_THRESHOLD: 'Below threshold',
  PREDATOR_SUPPRESSED: 'Predators in control',
  CROSSING_SOON: 'Crossing soon',
  ABOVE_THRESHOLD: 'Spray now',
  INSUFFICIENT_DATA: 'Not enough visits',
  STAGE_PAST_BENEFIT: 'Past spray benefit',
  IMPLAUSIBLE_GROWTH: 'Re-check the counts',
}

export function formatDate(iso: string | null): string {
  if (!iso) return '—'
  // Engine dates are UTC midnight; parsing them local would shift a day west.
  return new Date(iso + 'T00:00:00Z').toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  })
import type { Field } from './data/fields'
import type { Forecast } from './types'

/** Empty = same-origin (Render). Vercel sets VITE_API_URL to the Render API. */
const API_URL = (import.meta.env.VITE_API_URL as string | undefined)?.replace(/\/$/, '') ?? ''

/** Fresno County — matches WeatherPanel. Demo scout counts from demo.json. */
export async function forecastForField(field: Field): Promise<Forecast> {
  const res = await fetch(`${API_URL}/forecast`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      lat: 36.7378,
      lon: -119.7871,
      crop_price: 10.5,
      spray_cost_per_acre: 22,
      yield_potential_bu_ac: 50,
      seed: field.seed,
      observations: [
        {
          field_id: field.name,
          date: '2026-07-20',
          count_per_plant: 95,
          n_plants_sampled: 30,
          pct_plants_infested: 85,
          predator_count: 0.4,
          growth_stage: 'R3',
        },
        {
          field_id: field.name,
          date: '2026-07-24',
          count_per_plant: 180,
          n_plants_sampled: 30,
          pct_plants_infested: 92,
          predator_count: 0.6,
          growth_stage: 'R3',
        },
      ],
    }),
  })
  const body = await res.json().catch(() => ({}))
  if (!res.ok) {
    throw new Error(typeof body.error === 'string' ? body.error : `forecast failed (${res.status})`)
  }
  return body as Forecast
}

export function formatForecastLine(f: Forecast): string {
  const book = f.recommended_action_date
    ? ` Book the sprayer for ${shortDate(f.recommended_action_date)}.`
    : ''
  return `${f.message}${book}`
}

function shortDate(iso: string): string {
  const d = new Date(iso.includes('T') ? iso : `${iso}T12:00:00`)
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}
