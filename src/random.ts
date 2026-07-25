// Seeded sampling. Node has no RNG seeding and no scipy, so these are hand-rolled.
// All of it is standard, published algorithm — nothing invented here.

/** mulberry32. Seeded so Monte Carlo output is reproducible in tests. */
export function rng(seed: number): () => number {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Standard normal via Box-Muller. */
export function normal(u: () => number, mean = 0, sd = 1): number {
  let r = 0;
  while (r === 0) r = u(); // log(0) guard
  return mean + sd * Math.sqrt(-2 * Math.log(r)) * Math.cos(2 * Math.PI * u());
}

/** Gamma(shape, scale) via Marsaglia-Tsang (2000), with Johnk's boost for shape < 1. */
export function gamma(u: () => number, shape: number, scale: number): number {
  if (shape < 1) {
    return gamma(u, shape + 1, scale) * Math.pow(u(), 1 / shape);
  }
  const d = shape - 1 / 3;
  const c = 1 / Math.sqrt(9 * d);
  for (;;) {
    let x: number;
    let v: number;
    do {
      x = normal(u);
      v = 1 + c * x;
    } while (v <= 0);
    v = v * v * v;
    const uu = u();
    if (uu < 1 - 0.0331 * x * x * x * x) return d * v * scale;
    if (Math.log(uu) < 0.5 * x * x + d * (1 - v + Math.log(v))) return d * v * scale;
  }
}

/** Draw a plausible true field mean given a scout's reported mean.
 *
 *  Aphid counts are heavily overdispersed, so the mean of `nPlants` whole-plant
 *  counts carries real error. Variance of a single plant count comes from Taylor's
 *  power law (see singlePlantVariance); the mean's variance is that over nPlants.
 *
 *  ponytail: this is the Gamma half of a Gamma-Poisson (negative binomial) draw —
 *  the Poisson layer is dropped. At the densities that matter here the Poisson term
 *  is under 1% of total variance (at m=180 it is 0.65%), so it moves the standard
 *  deviation by ~0.3%. If this is ever reused for counts below ~20 aphids/plant the
 *  Poisson layer starts to matter and has to come back. */
export function sampleMean(
  u: () => number,
  reportedMean: number,
  nPlants: number,
  singleVar: number,
): number {
  if (reportedMean <= 0) return 0;
  const varOfMean = Math.max(singleVar / Math.max(1, nPlants), 1e-9);
  const shape = (reportedMean * reportedMean) / varOfMean;
  const scale = varOfMean / reportedMean;
  return gamma(u, shape, scale);
}

/** Quantile of a sorted numeric array, linear interpolation. */
export function quantile(sorted: number[], q: number): number {
  if (sorted.length === 0) return NaN;
  if (sorted.length === 1) return sorted[0];
  const pos = (sorted.length - 1) * q;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  if (lo === hi) return sorted[lo];
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo);
}
