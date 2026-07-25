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
