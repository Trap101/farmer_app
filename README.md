# farmer_app — threshold crossing forecast engine

Predicts the calendar date a soybean aphid population will cross its economic
threshold, so a grower can book the sprayer instead of spraying prophylactically.

Counts come from a human scout. No computer vision.

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

## The point

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

Where the research contradicted the spec it was built from, the corrections and
their sources are in [NOTES.md](NOTES.md).

## Running it

Needs **Node ≥ 22.18**. No `npm install` — there are no dependencies. Node runs the
TypeScript directly and `node --test` is the test runner.

```bash
npm test                      # 29 tests
npm run demo                  # the screen above (hits Open-Meteo)
node src/cli.ts demo.json --json
npm run serve                 # POST /forecast on :8787
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

## Layout

```
src/phenology.ts    degree-days + temperature suitability
src/growth.ts       growth rate estimation, shrinkage, predator suppression
src/thresholds.ts   Ragsdale ET/EIL recomputed from live prices
src/forecast.ts     Monte Carlo, guard rails, assembles the Forecast
src/weather.ts      Open-Meteo client with disk cache
src/random.ts       seeded RNG and samplers
src/cli.ts          src/server.ts
```

Sources are cited inline at each constant. [BRIEF.md](BRIEF.md) is the original
build brief.
