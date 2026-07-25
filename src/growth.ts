// Per-degree-day population growth rate: estimation from scout counts, shrunk
// toward a field-measured literature prior.

// ---------------------------------------------------------------------------
// Count overdispersion — Taylor's power law
// ---------------------------------------------------------------------------

/** Taylor's power law coefficients for whole-plant Aphis glycines counts:
 *  variance = a · mean^b.
 *
 *  Hodgson, Burkness, Hutchison & Ragsdale 2004, J. Econ. Entomol. 97(6):2127-2136,
 *  verbatim: "Taylor's power law parameters (a = 9.157 and b = 1.543)."
 *  89 data sets, 10 commercial Minnesota fields, 2001-2003.
 *
 *  Chosen over the Illinois fit (a = 6.399, b = 1.718, Environ. Entomol. 34(1):170)
 *  so the count model and the sampling plan come from the same study. The Illinois
 *  fit is more pessimistic at the threshold (k = 0.74 vs 1.37 at m = 250) and is a
 *  reasonable sensitivity case. */
export const TAYLOR_A = 9.157;
export const TAYLOR_B = 1.543;

/** Variance of a single whole-plant count at a given true mean. */
export function singlePlantVariance(mean: number): number {
  if (mean <= 0) return 0;
  return Math.max(TAYLOR_A * Math.pow(mean, TAYLOR_B), mean * 1.0001);
}

/** Negative binomial dispersion implied by Taylor's law at this mean.
 *  Var = m + m²/k  ⟹  k = m² / (a·m^b − m).
 *
 *  Reported for transparency, not used directly — k is NOT constant. It rises
 *  from ~0.6 at m = 40 to ~1.37 at m = 250, which is why the brief's fixed
 *  k = 1.5 is dropped in favour of the power law it came from. */
export function dispersionK(mean: number): number {
  const v = singlePlantVariance(mean);
  const excess = v - mean;
  if (excess <= 0) return Infinity;
  return (mean * mean) / excess;
}

// ---------------------------------------------------------------------------
// The prior on rho
// ---------------------------------------------------------------------------

/** Effective degree-days accrued on a typical corn-belt day during the aphid
 *  build-up window (~29 °C max / 17 °C min → 14.4 DD × phi(23 °C) = 13.4).
 *
 *  This is the conversion constant between the literature's per-DAY growth rates
 *  and this model's per-DEGREE-DAY axis. It is the single most load-bearing
 *  assumption in the prior — a calibration knob, deliberately named rather than
 *  buried. Raise it for a hotter region and the prior on rho falls proportionally. */
export const REF_EFF_DD_PER_DAY = 13.4;

/** Prior mean of rho, per effective degree-day.
 *
 *  Ragsdale et al. 2007 Table 1, across 19 location-years: r = 0.127 ± 0.014 /day
 *  (SEM), λ = 1.138 /day, doubling time 6.8 ± 0.8 d (range 2.7-13.4).
 *
 *  IMPORTANT: this is the FIELD rate, and it is deliberately not the lab rate.
 *  McCornack et al. 2004 measured doubling in 1.5 d at 25 °C under ideal caged
 *  conditions — roughly 4x faster. Hodgson et al. 2012 (JIPM 3(1), p. 4) calls out
 *  using lab doubling times as the documented failure mode: it "will result in an
 *  extremely low ET" and over-treatment. The brief's 2-3 d doubling assumption sits
 *  in that trap; this constant is the correction. */
export const RHO_PRIOR_MEAN = 0.127 / REF_EFF_DD_PER_DAY; // ≈ 0.0095 /DD

/** Prior SD, per effective degree-day. Ragsdale's SEM of 0.014 over n = 19
 *  location-years implies a between-field SD of 0.014·√19 = 0.061 /day. */
export const RHO_PRIOR_SD = (0.014 * Math.sqrt(19)) / REF_EFF_DD_PER_DAY; // ≈ 0.0046 /DD

/** Above this, treat the estimate as a data-entry error rather than biology.
 *  0.025 /DD is ≈ 0.335 /day, a 2.1-day doubling — faster than the fastest of
 *  Ragsdale's 19 location-years (2.7 d) and near the ideal-lab ceiling. Reaching it
 *  from real field counts means a miscount or a mistyped date. Brief Part 2. */
export const RHO_IMPLAUSIBLE = 0.025;

export interface RhoEstimate {
  mean: number;
  sd: number;
  /** 80% interval. */
  ci: [number, number];
  /** Raw regression slope before shrinkage; null when there is only one visit. */
  raw: number | null;
  /** True when the raw estimate exceeded RHO_IMPLAUSIBLE. */
  implausible: boolean;
  /** True when no field observation informed the estimate. */
  coldStart: boolean;
}

export interface RhoInput {
  /** Accumulated effective degree-days at each visit. */
  s: number;
  count: number;
  nPlants: number;
}

const Z80 = 1.2815515655446004; // 90th percentile of the standard normal

/** Estimate rho by regressing ln(count) on accumulated effective degree-days,
 *  then shrinking toward the literature prior by precision weighting.
 *
 *  Precision of the observed slope is sigma²/Sxx, where sigma² is the sampling
 *  variance of ln(mean count). That rises when plants are few and falls when the
 *  visits are far apart in physiological time — so a wider degree-day gap and a
 *  bigger sample earn more weight, exactly as the brief requires, but derived
 *  rather than asserted. */
export function estimateRho(visits: RhoInput[]): RhoEstimate {
  const usable = visits.filter((v) => v.count > 0);

  if (usable.length < 2) {
    // Cold start. With one visit there is no field evidence of growth at all —
    // not even evidence that the population IS growing. Reporting ±1.28 SD of the
    // prior would imply we had learned something about this field. We report the
    // prior's full plausible support instead, which keeps zero (a flat population)
    // inside the interval. That is why the cold-start interval is much wider than
    // one extra visit's worth of shrinkage would suggest.
    return {
      mean: RHO_PRIOR_MEAN,
      sd: RHO_PRIOR_SD,
      ci: [0, RHO_IMPLAUSIBLE],
      raw: null,
      implausible: false,
      coldStart: true,
    };
  }

  const n = usable.length;
  const sBar = usable.reduce((a, v) => a + v.s, 0) / n;
  const yBar = usable.reduce((a, v) => a + Math.log(v.count), 0) / n;
  let sxx = 0;
  let sxy = 0;
  for (const v of usable) {
    sxx += (v.s - sBar) ** 2;
    sxy += (v.s - sBar) * (Math.log(v.count) - yBar);
  }

  if (sxx <= 0) {
    // All visits at the same physiological time — no slope is identifiable.
    return {
      mean: RHO_PRIOR_MEAN,
      sd: RHO_PRIOR_SD,
      ci: [0, RHO_IMPLAUSIBLE],
      raw: null,
      implausible: false,
      coldStart: true,
    };
  }

  const raw = sxy / sxx;

  // Sampling variance of ln(mean count): var(mean)/mean², with var of a single
  // plant from Taylor's power law and the mean taken over nPlants.
  const sigma2 =
    usable.reduce((a, v) => {
      const varMean = singlePlantVariance(v.count) / Math.max(1, v.nPlants);
      return a + varMean / (v.count * v.count);
    }, 0) / n;

  const varObs = sigma2 / sxx;
  const precObs = varObs > 0 ? 1 / varObs : 0;
  const precPrior = 1 / (RHO_PRIOR_SD * RHO_PRIOR_SD);

  const mean = (precObs * raw + precPrior * RHO_PRIOR_MEAN) / (precObs + precPrior);
  const sd = Math.sqrt(1 / (precObs + precPrior));

  return {
    mean,
    sd,
    ci: [mean - Z80 * sd, mean + Z80 * sd],
    raw,
    implausible: raw > RHO_IMPLAUSIBLE,
    coldStart: false,
  };
}

// ---------------------------------------------------------------------------
// Predator suppression
// ---------------------------------------------------------------------------

/** Predators per aphid at which the population is treated as held.
 *
 *  BORROWED, and worth stating plainly: this is a SMALL GRAINS rule. University of
 *  Maryland IPM Threshold Guide, wheat at tillering: treat at 150 aphids/row-ft AND
 *  fewer than 1 predator per 50 aphids. There is no published soybean-aphid
 *  equivalent expressed as a predator:aphid ratio — UMN, Iowa State, SDSU and UNL
 *  all publish the flat 250/80%/increasing rule with natural enemies described only
 *  qualitatively.
 *
 *  Two independent checks say the borrowed number is about right for soybean:
 *   - UMD's own scouting page gives the looser "1 natural enemy per 50-100 aphids
 *     should be sufficient"; the threshold guide takes the conservative end.
 *   - Zhang & Swinton (2009) solved a soybean-specific dynamic program whose
 *     spray/no-spray surface implies roughly 1:67 (no spray below 1,000 aphids at
 *     15 natural enemies per plant).
 *
 *  The rigorous soybean approach is Hallett et al. 2014 (Pest Manag. Sci. 70:879),
 *  which converts each predator species to Natural Enemy Units by its measured
 *  consumption rate (1 NEU = 100 aphids consumed) rather than counting heads. That
 *  needs per-species scout data this interface does not collect, so it is not
 *  implemented. Calibration knob. */
export const PREDATOR_SUFFICIENCY_RATIO = 1 / 50;

/** Fraction of growth removed by resident natural enemies, in [0, 1]. */
export function predatorSuppression(predators: number, aphids: number): number {
  if (aphids <= 0) return 1;
  if (predators <= 0) return 0;
  return Math.min(1, predators / aphids / PREDATOR_SUFFICIENCY_RATIO);
}
