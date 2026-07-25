import { test } from "node:test";
import assert from "node:assert/strict";
import { extractScoutingSheet, sheetToObservation } from "../src/scout_ocr.ts";
import type { ScoutingSheet } from "../src/types.ts";

/** A complete sheet: 5 areas x 20 plants = 100 examined. */
const SHEET: ScoutingSheet = {
  crop: "soybean",
  date: "2026-07-24",
  scout_name: "T. Cheng",
  field_id: "North 40",
  growth_stage: "R3",
  areas_scouted: 5,
  plants_per_area: 20,
  soil_moisture: "moist",
  air_temp: "warm",
  insects: [
    {
      name: "soybean aphid",
      role: "pest",
      counts: [3400, 3600, 3800, 3500, 3700],
      plants_infested: [18, 19, 19, 18, 18],
      pct_written: 180,
    },
    { name: "lady beetle", role: "predator", counts: [12, 10, 14, 11, 13] },
    { name: "aphid mummies", role: "predator", counts: [4, 5, 3, 6, 2] },
    { name: "bean leaf beetle", role: "pest", counts: [2, 1, 0, 3, 1] },
  ],
  diseases: [],
  weeds: [],
  legibility: "clear",
  unreadable: [],
};

test("collapses a sheet into the Observation the engine takes", () => {
  const { observation, warnings } = sheetToObservation(SHEET);
  assert.ok(observation);
  assert.equal(observation.field_id, "North 40");
  assert.equal(observation.date, "2026-07-24");
  assert.equal(observation.n_plants_sampled, 100);
  assert.equal(observation.count_per_plant, 180); // 18000 aphids / 100 plants
  assert.equal(observation.pct_plants_infested, 92); // 92 of 100 plants
  assert.equal(observation.predator_count, 0.8); // (60 beetles + 20 mummies) / 100
  assert.equal(observation.growth_stage, "R3");
  assert.deepEqual(warnings, []);
});

test("only the named pest's counts reach count_per_plant", () => {
  // Bean leaf beetle is on the sheet and must not inflate the aphid density.
  const { observation } = sheetToObservation(SHEET, "bean leaf beetle");
  assert.equal(observation, null); // no plants_infested column filled for it
  const aphids = sheetToObservation(SHEET).observation!;
  assert.equal(aphids.count_per_plant * aphids.n_plants_sampled, 18000);
});

test("never substitutes the 4H-382-A % column for percent of plants infested", () => {
  // Instruction f computes total insects / total plants — 180% here. Using it
  // would fire the >=80% conjunction gate on arithmetic, not on observation.
  const noInfested = {
    ...SHEET,
    insects: [{ ...SHEET.insects[0], plants_infested: null }],
  };
  const { observation, warnings } = sheetToObservation(noInfested);
  assert.equal(observation, null);
  assert.ok(warnings.some((w) => w.includes("not equivalent")));
});

test("refuses to invent what the sheet does not say", () => {
  for (const missing of ["growth_stage", "date"] as const) {
    const { observation, warnings } = sheetToObservation({ ...SHEET, [missing]: null });
    assert.equal(observation, null, `${missing} missing should block the observation`);
    assert.ok(warnings.some((w) => w.includes(missing)));
  }
});

test("a partly-filled sheet is sized by the columns actually written", () => {
  // Four of five areas scouted, header count left blank: 80 plants, not 100.
  const partial: ScoutingSheet = {
    ...SHEET,
    areas_scouted: null,
    insects: [
      { name: "soybean aphid", role: "pest", counts: [100, 100, 100, 100], plants_infested: [10, 10, 10, 10] },
    ],
  };
  const { observation } = sheetToObservation(partial);
  assert.equal(observation!.n_plants_sampled, 80);
  assert.equal(observation!.count_per_plant, 5);
  assert.equal(observation!.pct_plants_infested, 50);
  assert.equal(observation!.predator_count, 0);
});

test("parses a Gemini response and surfaces API failures", async () => {
  process.env.GEMINI_API_KEY ??= "test-key";
  const ok = async () =>
    new Response(
      JSON.stringify({
        candidates: [
          {
            content: {
              parts: [
                { text: "planning...", thought: true },
                { text: JSON.stringify(SHEET) },
              ],
            },
          },
        ],
      }),
      { status: 200 },
    );
  const sheet = await extractScoutingSheet({ data: "AAAA", mime_type: "image/jpeg" }, ok as any);
  assert.equal(sheet.field_id, "North 40");

  const blocked = async () =>
    new Response(JSON.stringify({ candidates: [{ finishReason: "SAFETY" }] }), { status: 200 });
  await assert.rejects(
    () => extractScoutingSheet({ data: "AAAA", mime_type: "image/jpeg" }, blocked as any),
    /SAFETY/,
  );

  const err = async () =>
    new Response(JSON.stringify({ error: { message: "quota" } }), { status: 429 });
  await assert.rejects(
    () => extractScoutingSheet({ data: "AAAA", mime_type: "image/jpeg" }, err as any),
    /429.*quota/,
  );
});
