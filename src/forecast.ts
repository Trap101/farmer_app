// Assembles the forecast: physiological time from weather, a shrunk growth rate
// from scout counts, a price-driven threshold, and a Monte Carlo over all three.

import { effectiveDD } from "./phenology.ts";
import {
  RHO_IMPLAUSIBLE,
  estimateRho,
  predatorSuppression,
  singlePlantVariance,
} from "./growth.ts";
import { normal, quantile, rng, sampleMean } from "./random.ts";
import {
  LEAD_TIME_DAYS,
  MIN_PCT_PLANTS_INFESTED,
  classifyStage,
  computeThreshold,
} from "./thresholds.ts";
import { fetchWeather } from "./weather.ts";
import type { DailyWeather, Forecast, ForecastOptions, Observation, ReasonCode } from "./types.ts";

const DAY_MS = 86400000;
const DEFAULT_DRAWS = 1000;

/** Standard deviation of the forecast temperature error, °C.
 *  Applied as one offset per draw rather than per day: a forecast that runs warm
 *  runs warm for the whole week, and independent daily noise would average away to
 *  nothing and understate the real uncertainty. Brief 3.7. */
const TEMP_FORECAST_SD = 2.0;

// ---------------------------------------------------------------------------
// Dates. ISO strings in, ISO strings out; UTC throughout so a machine's local
// timezone can never shift a crossing date by a day.
// ---------------------------------------------------------------------------

const toMs = (iso: string): number => Date.parse(`${iso}T00:00:00Z`);
const toISO = (ms: number): string => new Date(ms).toISOString().slice(0, 10);
export const addDays = (iso: string, n: number): string => toISO(toMs(iso) + n * DAY_MS);

// ---------------------------------------------------------------------------

function buildDDIndex(w: DailyWeather): Map<string, number> {
  const idx = new Map<string, number>();
  let s = 0;
  for (let i = 0; i < w.time.length; i++) {
    s += effectiveDD(w.temperature_2m_max[i], w.temperature_2m_min[i]);
    idx.set(w.time[i], s);
  }
  return idx;
}

function reasonMessage(code: ReasonCode, f: Partial<Forecast>, et: number): string {
  switch (code) {
    case "STAGE_PAST_BENEFIT":
      return "Past mid-late R6. No insecticide treatment at this stage has been documented to increase yield — do not spray.";
    case "IMPLAUSIBLE_GROWTH":
      return "Estimated growth rate exceeds anything recorded in the field. Re-check the counts and visit dates before acting.";
    case "ABOVE_THRESHOLD":
      return `Already at or above the ${Math.round(et)} aphids/plant threshold with the field-wide infestation to match. Spray now.`;
    case "PREDATOR_SUPPRESSED":
      return "Natural enemies are handling this. Predator numbers are sufficient to hold the population — re-scout rather than spray.";
    case "INSUFFICIENT_DATA":
      return "Only one visit on record, so the growth rate is the regional prior rather than this field's. Scout again in 3-5 days to narrow this sharply.";
    case "CROSSING_SOON":
      return `${Math.round((f.p_cross_within_7d ?? 0) * 100)}% chance of crossing within 7 days — book the sprayer, don't spray today.`;
    default:
      return "Below threshold and not on track to cross within the next week. Re-scout in 5-7 days.";
  }
}

export async function forecastCrossing(
  observations: Observation[],
  opts: ForecastOptions,
): Promise<Forecast> {
  if (observations.length === 0) throw new Error("No observations supplied");

  const obs = [...observations].sort((a, b) => toMs(a.date) - toMs(b.date));
  const latest = obs[obs.length - 1];

  const weather = opts.weather ?? (await fetchWeather(opts.lat, opts.lon));
  const ddIndex = buildDDIndex(weather);

  for (const o of obs) {
    if (!ddIndex.has(o.date)) {
      throw new Error(
        `No weather for ${o.date}. Weather covers ${weather.time[0]} to ${weather.time[weather.time.length - 1]}.`,
      );
    }
  }

  const threshold = computeThreshold({
    cropPrice: opts.crop_price,
    sprayCostPerAcre: opts.spray_cost_per_acre,
    yieldPotential: opts.yield_potential_bu_ac,
    stage: latest.growth_stage,
  });
  const et = threshold.et_aphids;

  const rho = estimateRho(
    obs.map((o) => ({
      s: ddIndex.get(o.date)!,
      count: o.count_per_plant,
      nPlants: o.n_plants_sampled,
    })),
  );

  const citations = [
    "Ragsdale et al. 2007, J. Econ. Entomol. 100(4):1258-1267 — economic threshold equations, lambda = 1.138/day, field growth rate",
    "McCornack, Ragsdale & Venette 2004, J. Econ. Entomol. 97(3):854-861 — base 8.6 C, upper 34.9 C, growth optimum 25 C, doubling times",
    "Hodgson et al. 2004, J. Econ. Entomol. 97(6):2127-2136 — Taylor's power law a = 9.157, b = 1.543 for count overdispersion",
    "UNL Extension G2063 — early-R6 threshold 400-500; no documented benefit at or after mid-late R6",
    "UMD IPM Threshold Guide — 1 predator per 50 aphids (small grains; no published soybean-specific ratio exists)",
    "Weather: Open-Meteo daily 2 m temperature, https://open-meteo.com",
  ];

  const base = {
    field_id: latest.field_id,
    rho_per_dd: rho.mean,
    rho_ci: rho.ci,
    threshold,
    latest_count: latest.count_per_plant,
    citations,
  };

  const stop = (code: ReasonCode): Forecast => ({
    ...base,
    p_cross_within_7d: 0,
    median_cross_date: null,
    cross_date_ci80: null,
    recommended_action_date: null,
    reason_code: code,
    message: reasonMessage(code, {}, et),
  });

  // --- Guard rails, in priority order ------------------------------------
  // Ordering is deliberate: a rule that forbids spraying outright must be able to
  // pre-empt one that would recommend it.

  if (classifyStage(latest.growth_stage) === "past-benefit") return stop("STAGE_PAST_BENEFIT");
  if (rho.implausible) return stop("IMPLAUSIBLE_GROWTH");

  const suppression = predatorSuppression(latest.predator_count, latest.count_per_plant);
  if (suppression >= 1) return stop("PREDATOR_SUPPRESSED");

  // The threshold is a conjunction. A high mean carried by a few hot spots is not
  // a field at threshold, however large the number.
  const fieldWide = latest.pct_plants_infested >= MIN_PCT_PLANTS_INFESTED;

  if (fieldWide && latest.count_per_plant >= et) return stop("ABOVE_THRESHOLD");

  // A flat or shrinking population never earns a spray recommendation.
  if (rho.raw !== null && rho.raw <= 0) {
    return { ...stop("BELOW_THRESHOLD"), message: "Population is flat or declining. Do not spray; re-scout in 5-7 days." };
  }

  // --- Monte Carlo --------------------------------------------------------

  const anchor = latest.date;
  const anchorIdx = weather.time.indexOf(anchor);
  const fwdMax = weather.temperature_2m_max.slice(anchorIdx + 1);
  const fwdMin = weather.temperature_2m_min.slice(anchorIdx + 1);
  const horizon = fwdMax.length;

  const draws = opts.draws ?? DEFAULT_DRAWS;
  const u = rng(opts.seed ?? 20260724);
  const singleVar = singlePlantVariance(latest.count_per_plant);

  const offsets: number[] = [];
  let crossedWithin7 = 0;

  for (let d = 0; d < draws; d++) {
    const n0 = sampleMean(u, latest.count_per_plant, latest.n_plants_sampled, singleVar);
    let r = normal(u, rho.mean, rho.sd);
    if (r <= 0) {
      offsets.push(Infinity); // this draw's population never grows
      continue;
    }
    r = Math.min(r, RHO_IMPLAUSIBLE) * (1 - suppression);

    if (n0 >= et) {
      offsets.push(0);
      crossedWithin7++;
      continue;
    }

    const tempOffset = normal(u, 0, TEMP_FORECAST_SD);
    const need = Math.log(et / n0);

    let acc = 0;
    let day = Infinity;
    for (let i = 0; i < horizon; i++) {
      acc += r * effectiveDD(fwdMax[i] + tempOffset, fwdMin[i] + tempOffset);
      if (acc >= need) {
        day = i + 1;
        break;
      }
    }
    offsets.push(day);
    if (day <= 7) crossedWithin7++;
  }

  offsets.sort((a, b) => a - b);
  const p7 = crossedWithin7 / draws;

  const asDate = (q: number): string | null => {
    const v = quantile(offsets, q);
    return Number.isFinite(v) ? addDays(anchor, Math.round(v)) : null;
  };

  const median = asDate(0.5);
  const lo = asDate(0.1);
  const hi = asDate(0.9);
  const ci: [string, string] | null = lo && hi ? [lo, hi] : null;

  // Book the sprayer for the earliest plausible crossing, not the median: acting at
  // the median means half the distribution has already crossed by the time the
  // sprayer arrives. Never books a date in the past.
  //
  // Deviates from brief 3.4's `median - LEAD_TIME`, which for a crossing inside the
  // lead time returns a date that has already been and gone. The 10th percentile is
  // what the brief's own worked example actually shows.
  const action = lo ?? null;

  const code: ReasonCode = rho.coldStart
    ? "INSUFFICIENT_DATA"
    : !fieldWide
      ? "BELOW_THRESHOLD"
      : p7 >= 0.5
        ? "CROSSING_SOON"
        : "BELOW_THRESHOLD";

  const out: Forecast = {
    ...base,
    p_cross_within_7d: p7,
    median_cross_date: median,
    cross_date_ci80: ci,
    recommended_action_date: action,
    reason_code: code,
    message: "",
  };

  out.message = !fieldWide
    ? `Only ${latest.pct_plants_infested}% of plants are infested. The threshold needs ${MIN_PCT_PLANTS_INFESTED}% as well as the count, so it cannot fire yet.`
    : reasonMessage(code, out, et);

  return out;
}

export { LEAD_TIME_DAYS };
