import { test } from "node:test";
import assert from "node:assert/strict";
import { forecastCrossing } from "../src/forecast.ts";
import { PRICES, constantWeather, obs } from "./fixtures.ts";

const START = "2026-07-01";
const run = (observations: Parameters<typeof forecastCrossing>[0], over: Record<string, unknown> = {}) =>
  forecastCrossing(observations, { ...PRICES, weather: constantWeather(START, 60, 25), ...over });

const pair = (a: number, b: number, over: Record<string, unknown> = {}) => [
  obs({ date: "2026-07-10", count_per_plant: a, ...over }),
  obs({ date: "2026-07-15", count_per_plant: b, ...over }),
];

/** Brief Part 6. Two fields, identical counts and dates, differing only in
 *  temperature. The 32 C field banks more raw degree-days per day; it must still
 *  be forecast to cross LATER. */
test("heat suppression: the hot field crosses later, not earlier", async () => {
  const warm = await run(pair(95, 180), { weather: constantWeather(START, 60, 25) });
  const hot = await run(pair(95, 180), { weather: constantWeather(START, 60, 32) });

  assert.ok(warm.median_cross_date, "the 25 C field should cross inside the horizon");
  assert.ok(
    !hot.median_cross_date || hot.median_cross_date > warm.median_cross_date!,
    `hot ${hot.median_cross_date} vs warm ${warm.median_cross_date}`,
  );
  assert.ok(hot.p_cross_within_7d < warm.p_cross_within_7d, "and be less likely to cross soon");
});

/** Brief Part 6. */
test("monotonicity: a higher count never pushes the crossing later", async () => {
  const dates: string[] = [];
  for (const n of [120, 160, 200, 240]) {
    const f = await run(pair(n * 0.55, n));
    assert.ok(f.median_cross_date, `no crossing at ${n}`);
    dates.push(f.median_cross_date!);
  }
  for (let i = 1; i < dates.length; i++) {
    assert.ok(dates[i] <= dates[i - 1], `${dates[i]} came after ${dates[i - 1]}`);
  }
});

/** Brief Part 6. The threshold is a conjunction: count AND field-wide infestation
 *  AND an increasing population. A count well past the threshold on 60% of plants
 *  must not produce a spray recommendation. */
test("conjunction: 300/plant on 60% of plants does not trigger a spray", async () => {
  const f = await run(pair(150, 300, { pct_plants_infested: 60 }));
  assert.notEqual(f.reason_code, "ABOVE_THRESHOLD");
  assert.notEqual(f.reason_code, "CROSSING_SOON");
  assert.equal(f.reason_code, "BELOW_THRESHOLD");
  assert.match(f.message, /60%/);

  // Same counts, same growth, only the infestation share changes.
  const wide = await run(pair(150, 300, { pct_plants_infested: 95 }));
  assert.equal(wide.reason_code, "ABOVE_THRESHOLD");
});

/** Brief Part 6. */
test("predator suppression short-circuits the forecast", async () => {
  const f = await run(pair(95, 180, { predator_count: 4 }));
  assert.equal(f.reason_code, "PREDATOR_SUPPRESSED");
  assert.equal(f.recommended_action_date, null);
  assert.match(f.message, /[Nn]atural enemies/);
});

test("past mid-late R6 never recommends a spray", async () => {
  for (const stage of ["R6.5", "R6-late", "R7"]) {
    const f = await run(pair(300, 900, { growth_stage: stage, pct_plants_infested: 100 }));
    assert.equal(f.reason_code, "STAGE_PAST_BENEFIT", stage);
    assert.equal(f.recommended_action_date, null, stage);
  }
});

test("a single visit returns a forecast flagged as prior-driven", async () => {
  const f = await run([obs({ date: "2026-07-15", count_per_plant: 180 })]);
  assert.equal(f.reason_code, "INSUFFICIENT_DATA");
  assert.ok(f.rho_ci[1] - f.rho_ci[0] > 0.02, "the interval should be wide open");
  assert.ok(f.median_cross_date, "but still produce a usable estimate");
});

test("a declining population never recommends a spray", async () => {
  const f = await run(pair(240, 110));
  assert.equal(f.reason_code, "BELOW_THRESHOLD");
  assert.equal(f.recommended_action_date, null);
  assert.match(f.message, /declining/);
});

test("implausible growth asks the scout to re-check", async () => {
  const f = await run(pair(40, 900));
  assert.equal(f.reason_code, "IMPLAUSIBLE_GROWTH");
  assert.equal(f.recommended_action_date, null);
});

test("the same seed gives byte-identical output", async () => {
  const a = await run(pair(95, 180), { seed: 7 });
  const b = await run(pair(95, 180), { seed: 7 });
  const c = await run(pair(95, 180), { seed: 8 });
  assert.deepEqual(a, b);
  assert.notEqual(a.p_cross_within_7d, c.p_cross_within_7d);
});

test("the action date is never in the past and never after the crossing", async () => {
  const f = await run(pair(95, 180));
  assert.ok(f.recommended_action_date! >= "2026-07-15", "cannot book before the last visit");
  assert.ok(f.recommended_action_date! <= f.median_cross_date!, "must precede the median crossing");
});

test("observations outside the weather window fail loudly", async () => {
  await assert.rejects(
    () => run(pair(95, 180), { weather: constantWeather("2026-08-01", 20, 25) }),
    /No weather for/,
  );
});
