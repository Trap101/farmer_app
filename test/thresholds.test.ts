import { test } from "node:test";
import assert from "node:assert/strict";
import {
  ET_FLOOR,
  classifyStage,
  computeThreshold,
} from "../src/thresholds.ts";

const mean = (a: number[]) => a.reduce((x, y) => x + y, 0) / a.length;

/** The credibility anchor. Ragsdale's Table 2 is a 36-cell factorial and the paper
 *  publishes the mean and range of both the EIL and the ET across it. If our
 *  implementation is the published equation chain, it must reproduce all of them.
 *  Costs in $/acre, price in $/bu, yield in bu/acre — the paper's metric figures
 *  converted at its own stated equivalences. */
test("reproduces every published figure in Ragsdale et al. 2007", () => {
  const costs = [6.64, 9.92, 13.33];
  const prices = [5.5, 6.0, 6.5];
  const yields = [30, 40, 50, 60];

  const eils: number[] = [];
  const ets: number[] = [];
  for (const c of costs) {
    for (const v of prices) {
      for (const y of yields) {
        // ET_FLOOR is a product-safety rule, not part of the paper, so the
        // reproduction reads the raw computed value.
        const t = computeThreshold({ cropPrice: v, sprayCostPerAcre: c, yieldPotential: y });
        eils.push(t.eil_aphids);
        ets.push(t.et_computed);
      }
    }
  }

  // Tolerance is relative, not absolute. The paper publishes its regression
  // coefficients rounded (beta0 = 99.85, beta1 = 6.88), and reconstructing from
  // rounded constants cannot land on the unrounded originals. Everything below
  // agrees to better than 0.25%; a tighter absolute bound would be asserting
  // precision the published inputs do not carry.
  const close = (got: number, published: number, what: string) =>
    assert.ok(
      Math.abs(got - published) / published <= 0.005,
      `${what}: got ${got.toFixed(1)}, published ${published}`,
    );

  assert.equal(eils.length, 36);
  close(mean(eils), 674, "mean EIL");
  close(mean(ets), 273, "mean ET");
  close(Math.min(...eils), 275, "EIL low");
  close(Math.max(...eils), 1399, "EIL high");
  close(Math.min(...ets), 111, "ET low");
  close(Math.max(...ets), 567, "ET high");
});

test("lead-time ladder matches the published 592/458/354/273", () => {
  const costs = [6.64, 9.92, 13.33];
  const prices = [5.5, 6.0, 6.5];
  const yields = [30, 40, 50, 60];
  const published: Record<number, number> = { 1: 592, 3: 458, 5: 354, 7: 273 };

  for (const lead of [1, 3, 5, 7]) {
    const v: number[] = [];
    for (const c of costs)
      for (const p of prices)
        for (const y of yields)
          v.push(
            computeThreshold({
              cropPrice: p,
              sprayCostPerAcre: c,
              yieldPotential: y,
              leadTimeDays: lead,
            }).et_computed,
          );
    assert.ok(
      Math.abs(mean(v) - published[lead]) / published[lead] <= 0.005,
      `${lead}d lead: ${mean(v).toFixed(1)}, published ${published[lead]}`,
    );
  }
});

test("live prices actually move the threshold", () => {
  const cheap = computeThreshold({ cropPrice: 14.0, sprayCostPerAcre: 12.0, yieldPotential: 60 });
  const dear = computeThreshold({ cropPrice: 8.0, sprayCostPerAcre: 30.0, yieldPotential: 35 });
  // Expensive spray on a cheap, low-yielding crop has to clear a much higher bar.
  assert.ok(dear.et_computed > cheap.et_computed * 2, "threshold must respond to economics");
});

test("impractical thresholds are floored, not shipped", () => {
  // High yield, high price, cheap spray drives the raw equation to ~111, which the
  // paper explicitly calls immeasurable.
  const t = computeThreshold({ cropPrice: 13.0, sprayCostPerAcre: 6.0, yieldPotential: 65 });
  assert.ok(t.et_computed < ET_FLOOR, "this scenario should trip the floor");
  assert.equal(t.et_aphids, ET_FLOOR);
  assert.equal(t.floored, true);
});

test("growth stage classification", () => {
  for (const s of ["V6", "R1", "R3", "R5"]) assert.equal(classifyStage(s), "pre-R6", s);
  for (const s of ["R6", "r6", "R6-early"]) assert.equal(classifyStage(s), "early-R6", s);
  for (const s of ["R6.5", "R6-late", "R6-mid", "R7", "R8"])
    assert.equal(classifyStage(s), "past-benefit", s);
});

test("early R6 uses the provisional band, not the price equation", () => {
  const t = computeThreshold({ cropPrice: 10.5, sprayCostPerAcre: 22, stage: "R6" });
  assert.equal(t.et_aphids, 450);
  assert.equal(t.basis, "early-R6");
});
