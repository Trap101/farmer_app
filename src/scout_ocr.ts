// A photo of a filled-in paper scouting sheet -> structured JSON -> an
// Observation the forecast engine accepts.
//
// Layout follows Iowa State Extension 4H-382-A (rev. June 1986), plus five
// things that sheet does not collect but the engine needs: field id, crop
// growth stage, plants examined, per-area plants-carrying-any-aphids, and a
// pest/predator role per insect row. The blank printable version is
// scouting-form.html — if you change this schema, change that too.
//
// Nothing here is guessed on the grower's behalf: anything the model cannot
// read comes back null with a warning. n_plants_sampled drives the forecast's
// confidence interval, so a fabricated one silently narrows it.

import type { Observation, ScoutingSheet, ScoutRow } from "./types.ts";

const ENDPOINT = "https://generativelanguage.googleapis.com/v1beta/models";
// Overridable because model names churn faster than this file will.
const MODEL = process.env.GEMINI_MODEL ?? "gemini-3.6-flash";

// Gemini's responseSchema dialect: uppercase type names, `nullable`, no $ref.
// https://ai.google.dev/gemini-api/docs/structured-output
const NUM_ARRAY = { type: "ARRAY", items: { type: "NUMBER" } };

const ROW = (extra: Record<string, unknown>, required: string[]) => ({
  type: "OBJECT",
  properties: { name: { type: "STRING" }, ...extra },
  required: ["name", ...required],
});

const SHEET_SCHEMA = {
  type: "OBJECT",
  properties: {
    crop: { type: "STRING", nullable: true },
    date: { type: "STRING", nullable: true },
    scout_name: { type: "STRING", nullable: true },
    field_id: { type: "STRING", nullable: true },
    growth_stage: { type: "STRING", nullable: true },
    areas_scouted: { type: "INTEGER", nullable: true },
    plants_per_area: { type: "INTEGER", nullable: true },
    plant_height_in: { type: "NUMBER", nullable: true },
    soil_moisture: { type: "STRING", enum: ["wet", "moist", "dry"], nullable: true },
    soil_condition: {
      type: "STRING",
      enum: ["loose", "light crust", "hard crust"],
      nullable: true,
    },
    air_temp: { type: "STRING", enum: ["cool", "warm", "hot"], nullable: true },
    wind: { type: "STRING", enum: ["calm", "light", "strong"], nullable: true },
    sky: { type: "STRING", enum: ["partly sunny", "cloudy", "rainy"], nullable: true },
    insects: {
      type: "ARRAY",
      items: ROW(
        {
          role: {
            type: "STRING",
            enum: ["pest", "predator", "neutral", "unknown"],
            // Classified by the model, not a hard-coded species list here:
            // lady beetles, lacewings, syrphid larvae, minute pirate bugs,
            // damsel bugs and aphid mummies are all "predator" on this sheet.
          },
          causing_damage: { type: "BOOLEAN", nullable: true },
          /** One entry per scouted area, in written order. */
          counts: NUM_ARRAY,
          /** Plants in that area carrying ANY of this insect. Extra field. */
          plants_infested: { ...NUM_ARRAY, nullable: true },
          /** Whatever is written in the % column, transcribed not recomputed. */
          pct_written: { type: "NUMBER", nullable: true },
        },
        ["role", "counts"],
      ),
    },
    diseases: { type: "ARRAY", items: ROW({ plants_affected: NUM_ARRAY }, ["plants_affected"]) },
    weeds: { type: "ARRAY", items: ROW({ counts_per_sq_m: NUM_ARRAY }, ["counts_per_sq_m"]) },
    plant_population: { ...NUM_ARRAY, nullable: true },
    comments: { type: "STRING", nullable: true },
    legibility: { type: "STRING", enum: ["clear", "partly illegible", "mostly illegible"] },
    /** Labels of anything present on the paper but unreadable. */
    unreadable: { type: "ARRAY", items: { type: "STRING" } },
  },
  required: ["insects", "diseases", "weeds", "legibility", "unreadable"],
};

const PROMPT = `Transcribe this handwritten crop scouting sheet (Iowa State 4H-382-A or similar).

Rules:
- Transcribe only what is written. Never infer, average, or fill a blank. Anything
  blank or unreadable is null, and its label goes in "unreadable".
- "date" must be YYYY-MM-DD. Handwritten 2-digit years are 20xx.
- "counts" and "plants_affected" hold one number per scouted area, left to right,
  from the numbered area columns. Skip the written "Total" column — it is
  recomputed downstream — but do transcribe the % column into "pct_written".
- Circled options map to soil_moisture / soil_condition / air_temp / wind / sky.
- "role" is your entomological judgement of the named insect on soybean or corn:
  aphids, beetles, borers and worms are "pest"; lady beetles, lacewings, hover fly
  (syrphid) larvae, minute pirate bugs, damsel bugs, spiders and parasitised aphid
  mummies are "predator".
- If the sheet states plants examined per area (commonly 20) put it in
  plants_per_area; otherwise leave it null.`;

interface GeminiImage {
  /** Base64, no data: prefix. */
  data: string;
  mime_type: string;
}

/** `fetchImpl` is injected in tests to avoid a network call. */
export async function extractScoutingSheet(
  image: GeminiImage,
  fetchImpl: typeof fetch = fetch,
): Promise<ScoutingSheet> {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new Error("GEMINI_API_KEY is not set");
  if (!image?.data) throw new Error("image.data (base64) is required");

  const res = await fetchImpl(`${ENDPOINT}/${MODEL}:generateContent`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-goog-api-key": key },
    body: JSON.stringify({
      contents: [
        {
          parts: [
            { inline_data: { mime_type: image.mime_type || "image/jpeg", data: image.data } },
            { text: PROMPT },
          ],
        },
      ],
      // No temperature override — Gemini 3 degrades below its default of 1.0.
      generationConfig: { responseMimeType: "application/json", responseSchema: SHEET_SCHEMA },
    }),
  });

  const json: any = await res.json().catch(() => null);
  if (!res.ok) {
    throw new Error(`gemini ${res.status}: ${json?.error?.message ?? "no body"}`);
  }
  const text = (json?.candidates?.[0]?.content?.parts ?? [])
    .filter((p: any) => typeof p.text === "string" && !p.thought)
    .map((p: any) => p.text)
    .join("");
  if (!text) {
    const why = json?.candidates?.[0]?.finishReason ?? json?.promptFeedback?.blockReason;
    throw new Error(`gemini returned no content${why ? ` (${why})` : ""}`);
  }
  return JSON.parse(text) as ScoutingSheet;
}

const sum = (xs: number[]) => xs.reduce((a, b) => a + (Number.isFinite(b) ? b : 0), 0);

/**
 * Collapse a transcribed sheet into one Observation. Pure — no network.
 * Returns `observation: null` when the sheet is missing something the engine
 * cannot run without, with the reasons in `warnings`.
 */
export function sheetToObservation(
  sheet: ScoutingSheet,
  pest = "aphid",
): { observation: Observation | null; warnings: string[] } {
  const warnings: string[] = [];
  const insects = sheet.insects ?? [];
  const predators = insects.filter((r) => r.role === "predator");
  // Role wins over name: "aphid mummies" and "aphid midge" are natural enemies
  // and contain the pest's name. Counting them as aphids inflates the density
  // exactly when biological control is working.
  const rows = insects.filter(
    (r) => r.role !== "predator" && r.name?.toLowerCase().includes(pest.toLowerCase()),
  );

  // Areas actually written on the sheet beat the header count — a scout who
  // filled four columns of five gets four, not a diluted five.
  const areas = Math.max(
    sheet.areas_scouted ?? 0,
    ...insects.map((r) => r.counts?.length ?? 0),
    ...predators.map((r) => r.plants_infested?.length ?? 0),
  );
  const perArea = sheet.plants_per_area ?? 20; // 4H-382-A instruction 3: 20 plants per area.
  if (sheet.plants_per_area == null) {
    warnings.push("plants_per_area not on sheet; assumed 20 (4H-382-A default)");
  }
  const nPlants = areas * perArea;

  if (rows.length === 0) warnings.push(`no insect row matching "${pest}"`);
  if (!nPlants) warnings.push("could not determine how many plants were examined");
  if (!sheet.growth_stage) warnings.push("growth_stage missing — required by the forecast");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(sheet.date ?? "")) warnings.push("date missing or not ISO");
  if (sheet.legibility === "mostly illegible") warnings.push("sheet is mostly illegible");
  for (const f of sheet.unreadable ?? []) warnings.push(`unreadable on sheet: ${f}`);

  const infested = sum(rows.flatMap((r: ScoutRow) => r.plants_infested ?? []));
  const hasInfested = rows.some((r) => Array.isArray(r.plants_infested));
  if (!hasInfested) {
    // The 4H sheet's own % column is total insects / total plants (instruction
    // f), which exceeds 100 in any real aphid outbreak and is NOT percent of
    // plants infested. The engine's >=80% conjunction gate would misfire on it,
    // so it is never substituted here.
    warnings.push("no per-area 'plants infested' counts; % column on 4H-382-A is not equivalent");
  }

  if (rows.length === 0 || !nPlants || !sheet.growth_stage || !sheet.date || !hasInfested) {
    return { observation: null, warnings };
  }

  return {
    observation: {
      field_id: sheet.field_id ?? sheet.crop ?? "unnamed field",
      date: sheet.date,
      count_per_plant: sum(rows.flatMap((r) => r.counts ?? [])) / nPlants,
      n_plants_sampled: nPlants,
      pct_plants_infested: Math.min(100, (infested / nPlants) * 100),
      predator_count: sum(predators.flatMap((r) => r.counts ?? [])) / nPlants,
      growth_stage: sheet.growth_stage,
    },
    warnings,
  };
}
