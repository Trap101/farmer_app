import { test } from "node:test";
import assert from "node:assert/strict";
import {
  T_BASE_C,
  T_LETHAL_C,
  T_MAX_DEV_C,
  T_OPT_GROWTH_C,
  degreeDays,
  effectiveDD,
  phi,
} from "../src/phenology.ts";

test("degree-days: modified average with a horizontal cutoff", () => {
  assert.equal(degreeDays(25, 25), 25 - T_BASE_C);
  // Cold nights are floored at the base temperature, not counted as negative.
  assert.equal(degreeDays(20, 0), (20 + T_BASE_C) / 2 - T_BASE_C);
  // Hot days are capped at the upper developmental threshold.
  assert.equal(degreeDays(45, 20), (T_MAX_DEV_C + 20) / 2 - T_BASE_C);
  // A day entirely below the base accrues nothing, never a negative.
  assert.equal(degreeDays(5, -2), 0);
});

test("phi stays inside [0, 1] and zeroes outside the viable range", () => {
  for (let t = -10; t <= 50; t += 0.25) {
    const v = phi(t);
    assert.ok(v >= 0 && v <= 1, `phi(${t}) = ${v} out of range`);
  }
  assert.equal(phi(T_BASE_C - 0.01), 0);
  assert.equal(phi(T_LETHAL_C), 0, "nymphs do not complete development at 35 C");
  assert.equal(phi(40), 0);
});

/** The heart of the temperature model. McCornack measured population doubling at
 *  1.5 d at 25 C and 1.9 d at both 20 C and 30 C, so growth at 20 and 30 must each
 *  be ~79% of the 25 C peak, and 25 C must be the maximum. This is a property of
 *  (degree-days x phi), not of phi alone — phi is deliberately shaped so the
 *  product reproduces the measurements rather than double-counting temperature. */
test("effective growth peaks at 25 C and reproduces the measured doubling times", () => {
  const at = (t: number) => effectiveDD(t, t);

  const peak = at(T_OPT_GROWTH_C);
  for (const t of [12, 15, 18, 20, 22, 27, 28, 30, 32, 34]) {
    assert.ok(at(t) <= peak + 1e-9, `growth at ${t} C exceeded the 25 C peak`);
  }

  const expected = 1.5 / 1.9; // ratio of doubling times => ratio of growth rates
  assert.ok(Math.abs(at(20) / peak - expected) < 0.01, `20 C: ${(at(20) / peak).toFixed(3)}`);
  assert.ok(Math.abs(at(30) / peak - expected) < 0.01, `30 C: ${(at(30) / peak).toFixed(3)}`);
});

/** The failure this model exists to avoid: a naive degree-day accumulator banks
 *  23.4 DD/day at 32 C against 16.4 at 25 C and concludes the hot field explodes
 *  first. It does the opposite. */
test("a hot field accrues LESS effective growth than a warm one", () => {
  assert.ok(degreeDays(32, 32) > degreeDays(25, 25), "raw degree-days do favour the hot field");
  assert.ok(
    effectiveDD(32, 32) < effectiveDD(25, 25),
    "effective growth must not favour the hot field",
  );
});

test("growth declines monotonically above the optimum", () => {
  let prev = effectiveDD(T_OPT_GROWTH_C, T_OPT_GROWTH_C);
  for (let t = T_OPT_GROWTH_C + 0.5; t <= 36; t += 0.5) {
    const v = effectiveDD(t, t);
    assert.ok(v <= prev + 1e-9, `growth rose from ${prev.toFixed(3)} to ${v.toFixed(3)} at ${t} C`);
    prev = v;
  }
  assert.equal(prev, 0, "growth must reach zero by the lethal temperature");
});
