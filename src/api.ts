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
