import { test } from "node:test";
import assert from "node:assert/strict";
import {
  RHO_IMPLAUSIBLE,
  RHO_PRIOR_MEAN,
  dispersionK,
  estimateRho,
  predatorSuppression,
} from "../src/growth.ts";

const width = (ci: [number, number]) => ci[1] - ci[0];

/** Brief Part 6: counts 100 -> 200 across ~40 DD should yield rho ~ 0.017.
 *  That is a check on the raw estimator, before shrinkage — ln(2)/40 = 0.01733. */
test("doubling sanity: 100 -> 200 over 40 DD gives rho ~ 0.017", () => {
  const r = estimateRho([
    { s: 0, count: 100, nPlants: 30 },
    { s: 40, count: 200, nPlants: 30 },
  ]);
  assert.ok(Math.abs(r.raw! - 0.017329) < 1e-6, `raw rho was ${r.raw}`);
  // The reported value is shrunk toward the field prior, so it sits below the raw
  // estimate but stays on the same side of it.
  assert.ok(r.mean < r.raw!, "shrinkage must pull a fast estimate down");
  assert.ok(r.mean > RHO_PRIOR_MEAN, "but not all the way to the prior");
});

/** Brief Part 6. With one visit there is no field-specific evidence at all — not
 *  even that the population is growing — so the interval spans the full plausible
 *  range and collapses once a second visit lands. */
test("cold start: one visit gives an interval at least 3x wider than two", () => {
  const one = estimateRho([{ s: 0, count: 100, nPlants: 50 }]);
  const two = estimateRho([
    { s: 0, count: 100, nPlants: 50 },
    { s: 60, count: 200, nPlants: 50 },
  ]);

  assert.equal(one.coldStart, true);
  assert.equal(two.coldStart, false);
  assert.ok(
    width(one.ci) >= 3 * width(two.ci),
    `cold start ${width(one.ci).toFixed(5)} vs two-visit ${width(two.ci).toFixed(5)}`,
  );
  assert.ok(one.ci[0] <= 0, "a flat population must stay inside the cold-start interval");
});

test("more plants and a wider degree-day gap both tighten the interval", () => {
  const base = [
    { s: 0, count: 100, nPlants: 30 },
    { s: 40, count: 200, nPlants: 30 },
  ];
  const morePlants = [
    { s: 0, count: 100, nPlants: 120 },
    { s: 40, count: 200, nPlants: 120 },
  ];
  const widerGap = [
    { s: 0, count: 100, nPlants: 30 },
    { s: 120, count: 200, nPlants: 30 },
  ];
  assert.ok(width(estimateRho(morePlants).ci) < width(estimateRho(base).ci));
  assert.ok(width(estimateRho(widerGap).ci) < width(estimateRho(base).ci));
});

test("implausible growth is flagged rather than forecast", () => {
  // A tenfold jump over 30 DD is ~0.077/DD, three times the reject ceiling.
  const r = estimateRho([
    { s: 0, count: 50, nPlants: 30 },
    { s: 30, count: 500, nPlants: 30 },
  ]);
  assert.ok(r.raw! > RHO_IMPLAUSIBLE);
  assert.equal(r.implausible, true);
});

test("a declining population yields a negative raw slope", () => {
  const r = estimateRho([
    { s: 0, count: 200, nPlants: 30 },
    { s: 50, count: 90, nPlants: 30 },
  ]);
  assert.ok(r.raw! < 0);
});

/** Brief Part 6: 180 aphids with 4 predators must read as suppressed. */
test("predator suppression fires at 1 predator per 50 aphids", () => {
  assert.ok(predatorSuppression(4, 180) >= 1, "4 predators to 180 aphids is sufficient");
  assert.ok(predatorSuppression(1, 180) < 1, "1 predator to 180 aphids is not");
  assert.equal(predatorSuppression(0, 180), 0);
  assert.ok(predatorSuppression(3.6, 180) >= 1, "exactly 1:50 is the boundary");
});

/** k is not a constant — that is the whole reason the fixed default was dropped.
 *  Values are checked against Taylor's law applied to the Minnesota coefficients. */
test("dispersion rises with density, as Taylor's law requires", () => {
  const k40 = dispersionK(40);
  const k250 = dispersionK(250);
  assert.ok(k40 < k250, "k must rise with the mean");
  assert.ok(Math.abs(k40 - 0.6) < 0.05, `k(40) = ${k40.toFixed(2)}, expected ~0.60`);
  assert.ok(Math.abs(k250 - 1.37) < 0.05, `k(250) = ${k250.toFixed(2)}, expected ~1.37`);
});
