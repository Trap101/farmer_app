// Pure type declarations. Nothing here exists at runtime, so every import of this
// module must use `import type` — Node's type stripping only erases those.

export interface Observation {
  field_id: string;
  /** ISO date, YYYY-MM-DD. */
  date: string;
  count_per_plant: number;
  n_plants_sampled: number;
  /** 0-100. */
  pct_plants_infested: number;
  predator_count: number;
  /** "V6", "R3", "R5", "R6", "R6-late", "R7"... */
  growth_stage: string;
}

export type ReasonCode =
  | "BELOW_THRESHOLD"
  | "PREDATOR_SUPPRESSED"
  | "CROSSING_SOON"
  | "ABOVE_THRESHOLD"
  | "INSUFFICIENT_DATA"
  | "STAGE_PAST_BENEFIT"
  | "IMPLAUSIBLE_GROWTH";

export interface ThresholdResult {
  /** Economic injury level in cumulative aphid-days. */
  eil_cad: number;
  /** EIL expressed as aphids per plant. */
  eil_aphids: number;
  /** The threshold actually applied, after stage rules and flooring. */
  et_aphids: number;
  /** What the price-driven equation returned before stage rules and flooring. */
  et_computed: number;
  /** The 2003 NCSRP consensus action threshold. Not derived from the EIL. */
  et_consensus: number;
  /** True when et_computed fell below the practicality floor and was raised. */
  floored: boolean;
  /** Which rule set the threshold: "computed" | "early-R6" | "past-benefit". */
  basis: string;
  gain_threshold_pct: number;
}

export interface Forecast {
  field_id: string;
  p_cross_within_7d: number;
  median_cross_date: string | null;
  cross_date_ci80: [string, string] | null;
  recommended_action_date: string | null;
  rho_per_dd: number;
  rho_ci: [number, number];
  reason_code: ReasonCode;
  /** Human-readable one-liner the UI can show verbatim. */
  message: string;
  threshold: ThresholdResult;
  latest_count: number;
  citations: string[];
}

export interface ForecastOptions {
  lat: number;
  lon: number;
  /** $/bu. */
  crop_price: number;
  /** $/acre, insecticide + application. */
  spray_cost_per_acre: number;
  /** bu/acre. Required by Ragsdale Eq. 1; defaults to 50. */
  yield_potential_bu_ac?: number;
  /** Deterministic Monte Carlo for tests. */
  seed?: number;
  draws?: number;
  /** Injected in tests to avoid a network call. */
  weather?: DailyWeather;
}

export interface DailyWeather {
  /** ISO dates, ascending, contiguous. */
  time: string[];
  temperature_2m_max: number[];
  temperature_2m_min: number[];
}
