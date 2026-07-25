# BACKEND.md — handoff

Read this before touching `src/`. It tells you what exists, what to build next, and
which four things will silently break if you "clean them up".

**State:** working end to end. 35 tests green. Branch `feat/forecast-engine` pushed
to `Trap101/farmer_app`, no PR opened yet.

---

## What this is

A forecasting engine that predicts the calendar date a soybean aphid population
crosses its economic threshold. A human scout supplies counts — on paper, which
`POST /scout/ocr` transcribes with Gemini (`src/scout_ocr.ts`). There is no
computer vision on the crop itself and none is planned; the model reads
handwriting, not aphids.

The one thing that makes it not-a-spreadsheet: **the threshold is computed from the
grower's live crop price and spray cost**, not hard-coded at the industry-standard
250 aphids/plant. Everything else is in service of that.

## Run it

Needs **Node ≥ 22.18**. There is no `npm install` — zero dependencies, no build step,
no `tsconfig.json`. Node executes the TypeScript directly.

```bash
npm test                 # 29 tests, ~2s
npm run demo             # CLI against live Open-Meteo
npm run serve            # HTTP on :8787
```

---

## The contract the frontend calls

`POST /forecast` (`src/server.ts`, port 8787, CORS open). Body:

```jsonc
{
  "lat": 44.98, "lon": -93.26,
  "crop_price": 10.50,            // $/bu       — required
  "spray_cost_per_acre": 22.00,   // $/acre     — required
  "yield_potential_bu_ac": 50,    // optional, defaults to 50
  "seed": 42,                     // optional, makes the Monte Carlo reproducible
  "observations": [ /* one per scouting visit, see below */ ]
}
```

An `Observation` (full type in `src/types.ts`):

```jsonc
{
  "field_id": "North 40",
  "date": "2026-07-20",        // ISO, must fall inside the weather window
  "count_per_plant": 95,
  "n_plants_sampled": 30,      // drives the confidence interval — do not fake it
  "pct_plants_infested": 85,   // 0-100, ANY aphids present
  "predator_count": 0.4,       // per plant
  "growth_stage": "R3"         // "V6", "R1".."R5", "R6", "R6-late", "R7"...
}
```

Response is the `Forecast` type. The fields a UI actually needs:

| Field | Use |
|---|---|
| `reason_code` | Drives the whole UI state. Switch on this, not on the numbers. |
| `message` | Pre-written one-liner, safe to render verbatim. |
| `p_cross_within_7d` | 0-1. |
| `median_cross_date`, `cross_date_ci80` | ISO dates, or `null` if no crossing in the horizon. |
| `recommended_action_date` | The "book the sprayer for X" date. `null` means do not book. |
| `rho_per_dd`, `rho_ci` | Growth rate + 80% interval. **The interval width is a feature** — it is how the UI shows that another scouting visit is worth making. |
| `threshold` | `et_aphids` (applied), `et_computed` (raw), `et_consensus` (250), `eil_aphids`, `floored`, `basis`. |
| `citations` | Source list for the numbers in *this* run. |

`reason_code` is one of `BELOW_THRESHOLD`, `PREDATOR_SUPPRESSED`, `CROSSING_SOON`,
`ABOVE_THRESHOLD`, `INSUFFICIENT_DATA`, `STAGE_PAST_BENEFIT`, `IMPLAUSIBLE_GROWTH`.

**Only `ABOVE_THRESHOLD` means spray today.** `CROSSING_SOON` means book a sprayer
for `recommended_action_date` and do not spray now. When
`recommended_action_date` is `null`, the UI must not offer a booking action.

Errors return `{"error": "..."}` with a 4xx. `GET /health` → `{"ok":true}`.

---

## The paper sheet: `POST /scout/ocr`

Growers scout with a clipboard. `src/scout_ocr.ts` sends a photo of the filled-in
sheet to Gemini with a `responseSchema` and returns the transcription plus a ready
`Observation`. Needs `GEMINI_API_KEY`; `GEMINI_MODEL` overrides the default.

```bash
curl -s localhost:8787/scout/ocr -H 'content-type: application/json' \
  -d '{"image_base64":"<jpeg or png>","mime_type":"image/jpeg","pest":"aphid"}'
# -> { sheet, observation, warnings }
```

`observation` drops straight into the `observations` array of `POST /forecast`. It
is `null` whenever the sheet is missing something the engine cannot run without,
and `warnings` says which — the UI should show the sheet, the warnings, and let the
scout fix them by hand rather than sending a half-read sheet to the forecast.

`GET /form` serves `scouting-form.html`, the blank sheet to print. It is Iowa State
Extension 4H-382-A plus five fields that sheet lacks and the engine needs: field id,
growth stage, plants examined per area, plants-carrying-any per area, and a P/N
(pest / natural enemy) column. **The HTML and `SHEET_SCHEMA` are one artefact in two
files — change them together.**

### Three ways this goes silently wrong

**1. 4H-382-A's own % column is not percent of plants infested.** Its instruction f
says total insects / total plants, which is >100% in any real outbreak. The engine's
≥80% conjunction gate would then fire on arithmetic instead of on observation, so
the mapper never substitutes it — a sheet without the per-area
plants-carrying-any counts returns `observation: null`. That is the whole reason the
new column exists. Guarded by `test/scout_ocr.test.ts`.

**2. Role beats name when matching the pest.** "Aphid mummies" and "aphid midge" are
natural enemies whose names contain the pest's. Counting them as aphids inflates
density exactly when biological control is working. Any row the model marks
`predator` is excluded from the pest total, name match or not.

**3. Nothing is inferred on the grower's behalf.** Blank stays null and lands in
`warnings`. `n_plants_sampled` drives the confidence interval, so a plausible
guessed value silently narrows it — the one number a demo would never notice being
wrong. The single exception is `plants_per_area`, which falls back to the sheet's
own printed default of 20 and says so in `warnings`.

Verified live against a rendered filled-in sheet: all four header fields, three
circled weather/soil options, both insect tables and the P/N roles transcribed
exactly, into `{count_per_plant: 180, n_plants_sampled: 100, pct_plants_infested: 92,
predator_count: 0.6}` → `CROSSING_SOON`, book the sprayer for Jul 28.

---

## Do not undo these four things

Each of these looks like a mistake, is deliberate, and has a test guarding it. If a
test fails after you "simplify" one, the simplification is what's wrong.

**1. `src/phenology.ts` uses an interpolation table, not a Brière-1 curve.**
`BRIEF.md` specifies Brière-1. Brière-1 cannot fit this data — measured growth is
near-symmetric about 25 °C (0.79 at both 20 °C and 30 °C) and Brière is strongly
left-skewed, so no choice of `T_MAX` fits both shoulders. Worse, the brief's own
parameters make a 32 °C field forecast growth of 20.76 against 25 °C's 14.72 — the
hot field explodes *faster*, which is backwards and fails the brief's own required
test. Full derivation in `NOTES.md` §3. Guarded by
`test/phenology.test.ts`.

**2. The growth prior is the FIELD doubling time (6.8 d), not the lab one (1.5 d).**
Lab rates are ~4x faster and using them is a named, published failure mode: it
produces an artificially low threshold and over-treatment — the exact behaviour this
product exists to prevent. `NOTES.md` §2.

**3. Every import from `src/types.ts` must be `import type`.**
Node's type stripping only erases imports marked `type`. A plain
`import { Observation } from "./types.ts"` throws *at module load* with "does not
provide an export named" because `types.ts` has no runtime exports. Same constraint
bans `enum`, `namespace`, and constructor parameter properties anywhere in `src/`.

**4. The test glob is `test/**/*.test.ts`, not `test/`.**
`test/fixtures.ts` is shared helpers, not a test file. Pointing `node --test` at the
directory picks it up and it fails.

---

## What to build next

Roughly in order of value.

**1. Wire up the frontend.** The engine is done and the contract above is stable.
This is the only thing standing between here and a demo. The scout flow it should
implement: print `/form`, photo, `POST /scout/ocr`, show the transcription for the
scout to correct, then `POST /forecast`.

**2. Open a PR.** Branch is pushed, nothing exists on GitHub yet.

**3. Persist observations.** Right now every request carries its full scouting
history. That is fine for a demo and wrong for a product — a grower should scout,
save, and get an updated forecast without re-sending. Deliberately skipped per
`BRIEF.md` Part 7 (no database). Smallest useful version: a JSON file per field.

**4. Multi-field / multi-pest.** The threshold equations generalise; the thermal
constants in `phenology.ts` do not — they are soybean-aphid-specific. Adding a
second pest means a second constants block, not a rewrite. Brief allows up to three
crop-pest pairs.

**5. Speed Scouting (`Hodgson et al. 2004` binomial sequential sampling).** A scout
counts to 40 on a plant, marks +/-, and after 11 plants may already have a decision.
Much faster in the field than counting every aphid. The full stop-line table is in
the research notes at the bottom of this file. This is a genuinely good feature —
it changes what the scout does, not just what we compute.

### Blocked, and why — don't burn time rediscovering this

- **`pct_plants_infested` → mean density conversion.** Would let a scout skip exact
  counts. The binomial regression coefficients are paywalled, and the two candidate
  link functions (`ln(1−p)` vs `−ln(1−p)`) give materially different answers. One
  verified anchor point (p = 0.837 ↔ m = 250 at a tally threshold of 40) cannot
  identify two parameters. Getting this wrong is *silently* wrong. Needs the
  Hodgson et al. 2004 PDF (JEE 97(6):2127). Until then `pct_plants_infested` is used
  only for the ≥80% conjunction gate.
- **Backtesting against real season curves.** No free machine-readable
  aphids-per-plant time series appears to exist. The KBS LTER dataset
  (`lter.kbs.msu.edu/datatables/122.csv`) is real and downloadable but counts
  **alate flights in suction traps, not per-plant density** — its huge September
  peak is the fall migration to buckthorn and has no analogue in a density curve.
  Nearest per-plant data is figures-only in Costamagna & Landis (J. Insect Sci.
  10:144) and would need hand-digitising.
- **Exact `r_m` values from McCornack 2004** would sharpen the `phi` table. Paywalled
  (JEE 97(3):854). The current table is derived from the published doubling times,
  which is sound but one step removed.

---

## Landmines

- **80% ≠ 84%.** The economic threshold conjunction is ">80% of plants infested"
  counting *any* aphids. Speed Scouting uses "84% of plants at ≥40 aphids each" for
  the same 250/plant mean. Different definitions of "infested". Mixing them misreads
  a scout's sheet silently.
- **250 is not derived from the EIL.** It is a 2003 consensus rule that Ragsdale
  *validated*; the paper's own derived ET is 273. Report `et_computed` and
  `et_consensus` as separate things — never present 250 as calculated.
- **Dates are parsed as UTC everywhere** (`Date.parse(iso + "T00:00:00Z")`). Use
  `addDays` from `src/forecast.ts`. A local-time parse shifts crossing dates by a day
  west of UTC.
- **`seed` makes the Monte Carlo reproducible.** Omit it and identical inputs give
  slightly different output, which looks like a bug in a demo. The tests all pin it.
- **`.cache/`** holds Open-Meteo responses for 3 h and is gitignored. Delete it if
  weather looks stale. Open-Meteo bills a 46-day window as ~3-4 calls against a
  10k/day free quota, so keep the cache.
- **The threshold is a conjunction, not a count.** Count AND ≥80% infested AND
  population increasing. All three are enforced in `src/forecast.ts` and each has a
  test. Do not add a code path that fires on count alone.
- **Guard rail order in `forecastCrossing` is deliberate.** Rules that forbid
  spraying (`STAGE_PAST_BENEFIT`, `IMPLAUSIBLE_GROWTH`, `PREDATOR_SUPPRESSED`) are
  checked before any rule that could recommend it. Reordering them changes clinical
  behaviour.

---

## Where things live

```
src/phenology.ts    degree-days + temperature suitability      ← landmine 1
src/growth.ts       rho estimation, shrinkage, predators       ← landmine 2
src/thresholds.ts   Ragsdale ET/EIL from live prices           ← the differentiator
src/forecast.ts     Monte Carlo, guard rails, assembly         ← start here
src/weather.ts      Open-Meteo client + disk cache
src/random.ts       seeded RNG, normal/gamma samplers
src/types.ts        types only, no runtime exports             ← landmine 3
src/cli.ts          src/server.ts

BRIEF.md            the original spec. Five of its parameters are wrong.
NOTES.md            which five, why, and the sources. Read before changing constants.
```

Every constant in `src/` carries its citation inline. If you change one, change the
comment with it — `citations[]` in the response is assembled from what a run actually
used, and a stale comment turns into a lie shown to a grower.

---

## Reference: research already done, don't redo it

Verified, with sources, during the build. Details and URLs in `NOTES.md`.

- **Ragsdale et al. 2007** economic threshold chain — fully recovered and
  reproduced to <0.25% across the paper's 36-cell factorial. `test/thresholds.test.ts`.
- **McCornack et al. 2004** — base 8.6 °C, upper developmental 34.9 °C, growth
  optimum 25 °C, lab doubling 1.5 d @25 °C / 1.9 d @20 and 30 °C, death at 35 °C.
- **Taylor's power law** for count overdispersion, `a = 9.157, b = 1.543` (Minnesota,
  Hodgson et al. 2004). `k` is **not** constant: 0.60 at m=40 → 1.37 at m=250 → 1.88
  at m=500. Illinois fit (`6.399, 1.718`) is the pessimistic sensitivity case.
- **Open-Meteo** — forecast endpoint alone covers both history and forecast.
  `past_days` 0-93, `forecast_days` 0-16, combinable in one call. Celsius by default
  but `daily_units` is checked rather than assumed. No API key.
- **Predator ratio 1:50 is borrowed from small grains** (UMD IPM guide, wheat at
  tillering). No published soybean-specific ratio exists. Corroborated indirectly by
  Zhang & Swinton's soybean dynamic program (~1:67). The rigorous soybean approach is
  Hallett et al. 2014 Natural Enemy Units (1 NEU = 100 aphids consumed), which needs
  per-species scout counts this interface does not collect.
- **Speed Scouting stop lines** (Hodgson et al. 2012, Fig. 7). Plant is "+" at ≥40
  aphids; sample in sets, then:

  | Plants sampled | Do not treat | Keep sampling | Treat |
  |---|---|---|---|
  | 11 | ≤6 | 7-10 | 11 |
  | 16 | ≤10 | 11-14 | ≥15 |
  | 21 | ≤14 | 15-18 | ≥19 |
  | 26 | ≤18 | 19-22 | ≥23 |
  | 31 | ≤22 | 23-26 → stop, return in 3-4 d | ≥27 |

  A "treat" decision must be confirmed once more 3-4 days later.
