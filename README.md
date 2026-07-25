# SpraySense

Tells a grower the date to spray, instead of spraying on a calendar schedule.

Two halves in one repo:

- **Forecast engine** (`src/*.ts`, `test/`) — predicts the calendar date a soybean
  aphid population crosses its economic threshold. Deep docs: [BACKEND.md](BACKEND.md).
- **Field monitor UI** (`src/App.tsx`, `src/components/`) — the demo frontend: farm
  overview, per-field live feed, live weather. Deep docs: [frontend.md](frontend.md).

## Running it

Needs **Node ≥ 22.18**.

```bash
npm install        # frontend deps (React, Vite); the engine itself has none
npm run dev        # UI on http://localhost:5173
```

```bash
npm test           # 29 engine tests
npm run demo       # the engine's CLI demo (hits Open-Meteo)
npm run serve      # POST /forecast on :8787
```

Node runs the engine's TypeScript directly — `npm run build` typechecks and bundles
the frontend only.

## The engine
Counts come from a human scout, on paper. Photograph the filled-in sheet and
`POST /scout/ocr` transcribes it (Gemini) into the counts the engine takes.

```
$ npm run demo
Field: North 40 | Soybean R3
Jul 20: 95/plant -> Jul 24: 180/plant  (rho = 0.0111/DD, 80% CI 0.0066-0.0156)
Threshold 288/plant recomputed from your prices, +38 vs the 250 rule of thumb (Ragsdale et al. 2007)
  EIL 713/plant = 5873 aphid-days; gain threshold 4.19% of yield
DON'T SPRAY. 65% chance of crossing within 7 days — book the sprayer, don't spray today.
Median crossing: Jul 31 (80% CI Jul 27 - Aug 4)
Book the sprayer for Jul 27.
```

Most tools hard-code the threshold at 250 aphids/plant. That number is a 2003
consensus rule of thumb, and at today's prices it can be off by ±40%. This engine
recomputes it from the grower's actual crop price and spray cost using the equation
chain from Ragsdale et al. 2007 — verified to reproduce every figure published in
that paper to better than 0.25% (`test/thresholds.test.ts`).

Then it forecasts in **physiological time**: degree-days discounted by a temperature
suitability curve, so a heat wave correctly *delays* the crossing instead of
accelerating it. A Monte Carlo over count error, growth-rate uncertainty and
forecast temperature error turns that into a date distribution rather than a point
estimate. The interval width is the product — it tells the grower how much the next
scouting visit is worth.

Counts come from a human scout. No computer vision.

Where the research contradicted the spec it was built from, the corrections and
their sources are in [NOTES.md](NOTES.md).

### Interface
## Running it

Needs **Node ≥ 22.18**. No `npm install` — there are no dependencies. Node runs the
TypeScript directly and `node --test` is the test runner.

```bash
npm test                      # 35 tests
npm run demo                  # the screen above (hits Open-Meteo)
node src/cli.ts demo.json --json
npm run serve                 # POST /forecast, POST /scout/ocr on :8787
                              # /scout/ocr needs GEMINI_API_KEY
```

```bash
curl -s localhost:8787/forecast -H 'content-type: application/json' -d @demo.json
```

## The interface

```ts
forecastCrossing(observations: Observation[], opts: ForecastOptions): Promise<Forecast>
```

Every forecast carries a `reason_code` — `BELOW_THRESHOLD`, `PREDATOR_SUPPRESSED`,
`CROSSING_SOON`, `ABOVE_THRESHOLD`, `INSUFFICIENT_DATA`, `STAGE_PAST_BENEFIT`,
`IMPLAUSIBLE_GROWTH` — plus a `citations` list naming the sources behind the numbers
in that specific run.

Guard rails, all enforced and all tested:

| Condition | Behaviour |
|---|---|
| Past mid-late R6 | `STAGE_PAST_BENEFIT`, never recommends spraying |
| Fewer than 2 visits | `INSUFFICIENT_DATA`, prior-driven with a wide interval |
| <80% of plants infested | Cannot trigger — the threshold is a conjunction, not a count |
| Growth rate >0.025/DD | `IMPLAUSIBLE_GROWTH`, asks the scout to re-check |
| Population flat or declining | Never recommends spraying |
| Predators ≥1 per 50 aphids | `PREDATOR_SUPPRESSED` |

## The UI

1. **Farm overview** — 5 fields as flat rectangles on black. Hover for health / pest risk.
2. Click any field — the block scales up to fill the screen.
3. **Field monitor** — field feed video on the left, live Fresno CA weather on the
   right (Open-Meteo, no API key, 60 s refresh), **Calculate next spray date** at the bottom.

The calculate button is still stubbed — wiring it to the engine above is the
remaining integration step (`TODO(ml-team)` in
[src/components/FieldDetail.tsx](src/components/FieldDetail.tsx)).

## Layout

```
src/phenology.ts    degree-days + temperature suitability
src/growth.ts       growth rate estimation, shrinkage, predator suppression
src/thresholds.ts   Ragsdale ET/EIL recomputed from live prices
src/forecast.ts     Monte Carlo, guard rails, assembles the Forecast
src/weather.ts      Open-Meteo client with disk cache
src/random.ts       seeded RNG and samplers
src/cli.ts          src/server.ts

src/App.tsx         screen state
src/components/     FarmOverview, FieldCard, FieldDetail, LiveFeed, WeatherPanel
src/data/fields.ts  the 5 demo fields
src/styles.css      all styling
```

Sources are cited inline at each constant. [BRIEF.md](BRIEF.md) is the original
build brief.
---

# The frontend

The grower-facing UI over the engine above. Vite + React 18 + Framer Motion.
Architecture in [frontend.md](frontend.md).
**Live demo:** https://spraysense.onrender.com

## Run it

```bash
npm install                                            # the UI has deps; the engine has none
npm run serve                                          # engine on :8787 (needs GEMINI_API_KEY for OCR)
npm run dev                                            # UI on :5173, proxies /api -> :8787

ENGINE_ORIGIN=https://spraysense.onrender.com npm run dev   # or borrow the deployed engine
```
Open http://localhost:5173 (or the [live demo](https://spraysense.onrender.com)).

## Demo flow

1. **Farm overview** — five fields as flat rectangles on black. Hover for a
   health / pest-risk readout.
2. **Click South Flat** — the block scales up to fullscreen (Framer Motion
   shared-layout transition). This is the soybean field, the only one the engine
   can model; the other four open too but say plainly that their crop isn't
   modelled.
3. **Photograph a filled-in scout sheet** — "Print blank sheet" serves the
   engine's `/form`. Gemini transcribes the handwriting via `POST /scout/ocr`.
4. **Check the transcription** — every value is editable, blanks are flagged red,
   and Confirm stays disabled until they're filled. Nothing is guessed for you.
5. **Calculate next spray date** — `POST /forecast` with every confirmed visit.
   The spray plan shows a 14-day calendar (booking date, median crossing, 80%
   interval), the price-derived threshold, and the sources behind each number.

Two visits are what produce a real growth rate; one gives a prior-driven forecast
with a deliberately wide interval.

## Notes for the team

- **Video**: `public/field-feed.mp4` (1280×720 h264, 8 s loop). Every field
  shares this one clip and relabels it `CAM-01 · <FIELD NAME>` — swap the file to
  change the footage everywhere. If it's missing or won't decode, an animated
  canvas simulation renders instead so the demo never breaks.
- **No dose.** The engine computes *when* to spray, not *how much* — it carries
  no product or application rate anywhere. The plan panel shows timing plus the
  economics it does compute, and claims no dose.
- **Deploying.** On Render one host serves both the built UI and the API, so the
  frontend uses relative paths and needs no configuration. Splitting them (e.g.
  the UI on Vercel) requires `VITE_ENGINE_ORIGIN` set to the engine's origin at
  build time.
