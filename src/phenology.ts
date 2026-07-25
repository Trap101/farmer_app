// Physiological time for Aphis glycines: degree-day accumulation and a temperature
// suitability multiplier derived from measured population doubling times.

// ---------------------------------------------------------------------------
// Thermal constants
// ---------------------------------------------------------------------------

/** Lower developmental threshold, °C.
 *  McCornack, Ragsdale & Venette 2004, J. Econ. Entomol. 97(3):854-861.
 *  https://academic.oup.com/jee/article-abstract/97/3/854/2218057
 *  Cross-checked against Chen et al. 2017 (8.27 °C on white clover) — two hosts,
 *  two continents, two estimators, agreeing to within 0.35 °C. */
export const T_BASE_C = 8.6;

/** Upper developmental threshold, °C (modified Logan fit). McCornack et al. 2004.
 *  Used ONLY as the horizontal cutoff for degree-day accumulation — see the note
 *  on T_LETHAL_C for why this is not the ceiling on population growth. */
export const T_MAX_DEV_C = 34.9;

/** Temperature at which nymphs fail to complete development, °C.
 *  McCornack et al. 2004, verbatim: "Nymphs exposed to 35 °C did not complete
 *  development, and all individuals died within 11 d." */
export const T_LETHAL_C = 35.0;

/** Temperature of peak population growth, °C. McCornack et al. 2004:
 *  "Population growth rates were greatest at 25 °C." */
export const T_OPT_GROWTH_C = 25.0;

// ---------------------------------------------------------------------------
// Temperature suitability, derived from measured doubling times
// ---------------------------------------------------------------------------

/** Laboratory population doubling times, days, at constant temperature.
 *  McCornack et al. 2004, verbatim: "At 25 °C, aphid populations doubled in 1.5 d;
 *  at 20 and 30 °C, populations doubled in 1.9 d." At 35 °C development fails.
 *
 *  These are LAB rates under ideal conditions. They are used here only for the
 *  SHAPE of the temperature response — the absolute rate comes from field data
 *  (see RHO_PRIOR_MEAN in growth.ts). Driving a forecast off the 1.5 d lab
 *  doubling time is the documented failure mode that produces artificially low
 *  thresholds and over-treatment (Hodgson et al. 2012, JIPM 3(1), p. 4). */
const LAB_DOUBLING_DAYS: Array<[number, number]> = [
  [20, 1.9],
  [25, 1.5],
  [30, 1.9],
];

/** Why this is a table and not a Brière-1 curve.
 *
 *  The obvious move is Brière-1, phi = a·T·(T−Tb)·sqrt(Tm−T). It cannot fit this
 *  data. Measured growth relative to the 25 °C peak is 0.79 at 20 °C and 0.79 at
 *  30 °C — near-symmetric about the optimum. Brière-1 is strongly left-skewed:
 *  fitted with Tm = 30 it reproduces 20 °C exactly but forces growth to zero at
 *  30 °C, and fitted with Tm = 35 it puts the peak at 29 °C and predicts 30 °C
 *  grows FASTER than 25 °C. No choice of Tm fits both shoulders. Wrong functional
 *  family; interpolating the measurements is both more accurate and less code.
 *
 *  phi is defined so that (degree-days × phi) is proportional to measured r_m:
 *
 *      phi(T) ∝ r_m(T) / (T − T_BASE)
 *
 *  Without this division the model would apply temperature twice — once through
 *  degree-day accumulation and again through the multiplier — and a 30 °C field
 *  would be forecast to grow faster than a 25 °C one despite the measurements
 *  saying the opposite. */
function buildPhiTable(): Array<[number, number]> {
  const raw = LAB_DOUBLING_DAYS.map(
    ([t, dt]) => [t, Math.LN2 / dt / (t - T_BASE_C)] as [number, number],
  );
  const peak = Math.max(...raw.map(([, v]) => v));
  const norm = raw.map(([t, v]) => [t, v / peak] as [number, number]);

  // Below the coolest measured point the ratio r_m/(T−T_BASE) is flat: both
  // numerator and denominator go to zero linearly at T_BASE. A flat multiplier
  // there is exactly the standard linear degree-day assumption, which is
  // uncontroversial in the sub-optimal range.
  return [[T_BASE_C, norm[0][1]], ...norm, [T_LETHAL_C, 0]];
}

const PHI_TABLE = buildPhiTable();

function lerp(table: Array<[number, number]>, x: number): number {
  if (x <= table[0][0]) return 0;
  if (x >= table[table.length - 1][0]) return 0;
  for (let i = 1; i < table.length; i++) {
    const [x1, y1] = table[i];
    if (x <= x1) {
      const [x0, y0] = table[i - 1];
      return y0 + ((y1 - y0) * (x - x0)) / (x1 - x0);
    }
  }
  return 0;
}

/** Population-growth suitability at temperature `t`, in [0, 1]. */
export function phi(t: number): number {
  return lerp(PHI_TABLE, t);
}

/** Exposed for tests and for anyone auditing the derivation. */
export const phiTable = (): Array<[number, number]> => PHI_TABLE.map((r) => [...r] as [number, number]);

// ---------------------------------------------------------------------------
// Degree-days
// ---------------------------------------------------------------------------

/** Modified average method with a horizontal cutoff at the upper threshold.
 *  Brief 3.1. */
export function degreeDays(tmax: number, tmin: number): number {
  const hi = Math.min(tmax, T_MAX_DEV_C);
  const lo = Math.max(tmin, T_BASE_C);
  if (hi <= T_BASE_C) return 0; // whole day below the base temperature
  return Math.max(0, (hi + lo) / 2 - T_BASE_C);
}

/** Physiological time accrued in one day, discounted for heat stress.
 *  Growth is proportional to this, not to raw degree-days. */
export function effectiveDD(tmax: number, tmin: number): number {
  return degreeDays(tmax, tmin) * phi((tmax + tmin) / 2);
}

/** Running total of effective degree-days, index-aligned to the input arrays. */
export function accumulate(tmax: number[], tmin: number[]): number[] {
  const out: number[] = [];
  let s = 0;
  for (let i = 0; i < tmax.length; i++) {
    s += effectiveDD(tmax[i], tmin[i]);
    out.push(s);
  }
  return out;
}
