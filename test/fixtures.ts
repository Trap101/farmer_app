import type { DailyWeather, Observation } from "../src/types.ts";

const DAY_MS = 86400000;

/** Synthetic weather at a fixed daily min/max, so tests never touch the network
 *  and temperature is the only thing varying between cases. */
export function constantWeather(
  start: string,
  days: number,
  tmax: number,
  tmin = tmax,
): DailyWeather {
  const t0 = Date.parse(`${start}T00:00:00Z`);
  const time: string[] = [];
  for (let i = 0; i < days; i++) {
    time.push(new Date(t0 + i * DAY_MS).toISOString().slice(0, 10));
  }
  return {
    time,
    temperature_2m_max: time.map(() => tmax),
    temperature_2m_min: time.map(() => tmin),
  };
}

export function obs(over: Partial<Observation> & Pick<Observation, "date" | "count_per_plant">): Observation {
  return {
    field_id: "Test Field",
    n_plants_sampled: 30,
    pct_plants_infested: 90,
    predator_count: 0,
    growth_stage: "R3",
    ...over,
  };
}

/** Prices used across the behavioural tests. Threshold lands near 289/plant. */
export const PRICES = {
  lat: 44.98,
  lon: -93.26,
  crop_price: 10.5,
  spray_cost_per_acre: 22.0,
  yield_potential_bu_ac: 50,
  seed: 42,
};
