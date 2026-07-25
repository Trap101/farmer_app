// The economic threshold, recomputed from live prices.
//
// Source for the whole equation chain: Ragsdale, Landis, Brodeur, Heimpel & Desneux
// (2007), "Economic Threshold for Soybean Aphid (Hemiptera: Aphididae)",
// J. Econ. Entomol. 100(4):1258-1267.
// Full text: https://soybeanresearchinfo.com/wp-content/uploads/2019/03/Aphid_economicthreshold.pdf
//
// Note this is NOT the textbook Pedigo form EIL = C/(V·I·D·K). Ragsdale used a gain
// threshold feeding a cumulative-aphid-day (CAD) to yield regression. There is no
// separate injury or damage coefficient — the regression slope is both.

import type { ThresholdResult } from "./types.ts";

/** Discrete daily population growth rate, λ = e^r. Ragsdale Table 1: r = 0.127 ±
 *  0.014 /day across 19 location-years, doubling time 6.8 ± 0.8 d. */
export const LAMBDA = 1.138;

/** Fig. 3 regression of proportion of maximum yield on cumulative aphid-days:
 *  y = −0.0688x + 0.9985, x in units of 10,000 CAD. R² = 0.665, n = 116.
 *  Verbatim: "Yield (tons per hectare) was reduced by 6.88% (95% CI was 5.94-7.82%)
 *  for every 10,000 aphid-days." */
export const CAD_YIELD_SLOPE_PCT = 6.88;
export const CAD_YIELD_INTERCEPT_PCT = 99.85;

/** Days of warning the threshold is meant to buy. Ragsdale's headline ET of 273
 *  uses 7; UNL describes the operational 250 as buying "five to seven days". */
export const LEAD_TIME_DAYS = 7;

/** The 2003 NCSRP consensus action threshold.
 *
 *  Widely misquoted as being derived from the EIL. It is not. Ragsdale verbatim:
 *  the study's ET of 273 "overlaps a consensus action threshold that was promoted
 *  after a widespread soybean aphid outbreak that occurred in 2003 of 250 aphids per
 *  plant". The paper validated 250; it did not produce it. Reported alongside the
 *  computed value so a grower can see both. */
export const ET_CONSENSUS = 250;

/** Practicality floor on the computed threshold, aphids/plant.
 *
 *  At high yield, high price and low spray cost the equation returns an ET of 111,
 *  and the paper explicitly disowns that region: the corresponding gain threshold is
 *  about 1 bu/acre and "significant yield differences this small were not measurable
 *  from any of our 19 location-years... these low ET values [are] impractical, and
 *  the yield loss associated with the corresponding EILs is immeasurable."
 *  Spraying below this is buying yield protection the field trials could not detect. */
export const ET_FLOOR = 150;

/** Ragsdale's Table 2 factorial spanned 30-60 bu/acre; 50 is the midpoint. */
export const DEFAULT_YIELD_BU_AC = 50;

/** Provisional early-R6 threshold, aphids/plant. UNL Extension G2063, verbatim:
 *  "Thresholds for early R6 have yet to be determined but are likely in the range of
 *  400-500 aphids per plant." Midpoint used. */
export const ET_EARLY_R6 = 450;

export type StageClass = "pre-R6" | "early-R6" | "past-benefit";

/** Classify a scout's growth-stage string.
 *
 *  The R1-R5 window is where Ragsdale's ET is valid: "the ET developed here for a
 *  7 d lead time is valid between R1 and R5." UNL extends the operational threshold
 *  down through late vegetative. Past mid-R6 there is no benefit to document:
 *  "Insecticide treatment during or after mid-late R6 has not been documented to
 *  increase yield."
 *
 *  A bare "R6" is read as EARLY R6, because that is what a scout who has not been
 *  asked to subdivide will write. Use "R6-late" / "R6.5" to say otherwise. */
export function classifyStage(stage: string): StageClass {
  const s = stage.trim().toUpperCase();
  if (/^R6[.-]?(5|LATE|MID)/.test(s)) return "past-benefit";
  if (/^R[78]/.test(s)) return "past-benefit";
  if (/^R6/.test(s)) return "early-R6";
  return "pre-R6";
}

export interface ThresholdInputs {
  /** $/bu. */
  cropPrice: number;
  /** $/acre, insecticide plus application. */
  sprayCostPerAcre: number;
  /** bu/acre. */
  yieldPotential?: number;
  stage?: string;
  leadTimeDays?: number;
}

/** Recompute the economic threshold from live prices.
 *
 *  Ragsdale Eq. 1-4 plus the lead-time step stated in the text. Verified to
 *  reproduce every published figure in the paper: across the same 36-cell factorial
 *  (C = $6.64/$9.92/$13.33 per acre, V = $5.50/$6.00/$6.50 per bu, Y = 30/40/50/60
 *  bu/acre) this returns a mean EIL of 673 (published 674), a mean 7-day ET of 272
 *  (published 273), an EIL range of 275-1398 (published 275-1399) and an ET range of
 *  111-566 (published 111-567). See test/thresholds.test.ts. */
export function computeThreshold(inp: ThresholdInputs): ThresholdResult {
  const yieldPotential = inp.yieldPotential ?? DEFAULT_YIELD_BU_AC;
  const lead = inp.leadTimeDays ?? LEAD_TIME_DAYS;

  // Eq. 1 — gain threshold, the yield fraction the spray has to save to pay for
  // itself. Units of C and V cancel against Y, so $/acre with bu/acre is fine.
  const gainThresholdPct = (inp.sprayCostPerAcre / (inp.cropPrice * yieldPotential)) * 100;

  // Eq. 2 — EIL in cumulative aphid-days.
  const eilCad =
    ((CAD_YIELD_INTERCEPT_PCT - (100 - gainThresholdPct)) / CAD_YIELD_SLOPE_PCT) * 10000;

  // Eq. 4 — invert the geometric progression to get the EIL as aphids per plant.
  // The series starts at a = 1 aphid/plant: "the accumulation of aphid-days is
  // insignificant until densities reach an average of one aphid per plant."
  const eilAphids = (eilCad * (LAMBDA - 1) + 1) / LAMBDA;

  // Step back `lead` days of growth to get the threshold a scout can act on.
  const etComputed = eilAphids * Math.pow(LAMBDA, -lead);

  const stageClass = classifyStage(inp.stage ?? "R3");
  let etAphids: number;
  let basis: string;

  if (stageClass === "past-benefit") {
    etAphids = Infinity;
    basis = "past-benefit";
  } else if (stageClass === "early-R6") {
    // Ragsdale: "our data suggest that an ET for R6 and later growth stages will
    // exceed 273 aphids per plant, but we have too few data sets to accurately
    // estimate the ET during R6." Fall back to UNL's provisional band rather than
    // extrapolating a regression outside its fitted range.
    etAphids = ET_EARLY_R6;
    basis = "early-R6";
  } else {
    // Order matters. Cap at the EIL first — a threshold above the injury level
    // would tell a grower to spray after the damage is already done. Then apply the
    // floor, which must win even when the EIL itself lands below it: cheap spray on
    // a high-yielding, high-priced crop can drive the whole calculation into the
    // region the paper says is unmeasurable, and the answer there is "this is noise,
    // use the floor", not "spray at 99 aphids".
    etAphids = Math.max(Math.min(etComputed, eilAphids), ET_FLOOR);
    basis = "computed";
  }

  return {
    eil_cad: eilCad,
    eil_aphids: eilAphids,
    et_aphids: etAphids,
    et_computed: etComputed,
    et_consensus: ET_CONSENSUS,
    floored: basis === "computed" && Math.min(etComputed, eilAphids) < ET_FLOOR,
    basis,
    gain_threshold_pct: gainThresholdPct,
  };
}

/** Minimum share of plants that must carry aphids before the threshold can fire.
 *
 *  The economic threshold is a conjunction, not a count: 250 aphids/plant AND >80%
 *  of plants infested AND populations increasing. A high mean over a few hot spots
 *  is not a field at threshold.
 *
 *  Careful: this 80% counts a plant as infested if it carries ANY aphids. The
 *  Speed Scouting plan uses a different and stricter definition — 84% of plants at
 *  >=40 aphids each — for the same 250 aphids/plant mean. The two are not
 *  interchangeable and mixing them is the easiest way to misread a scout's sheet. */
export const MIN_PCT_PLANTS_INFESTED = 80;
