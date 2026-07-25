# Threshold Crossing Forecast Engine — Build Brief

**Context:** Hackathon build, ~2 hours. Product predicts the calendar date a pest
population will cross its economic threshold, so a grower can schedule a spray
instead of spraying prophylactically. Counts are supplied by a human scout — there
is no computer vision in this component.

**Your job:** research the parameters, then build the forecasting module. Work in
Python. No UI — expose a clean function the frontend calls.

---

## Part 1 — Research objectives (do these FIRST, timebox 25 min)

Verify or correct every parameter in the table in Part 2. Do not trust the values
below blindly; they were gathered quickly. Where you find a better source, update
the constant AND the citation comment in code.

### R1. Soybean aphid thermal parameters — HIGH PRIORITY
Primary source: **McCornack, Ragsdale & Venette (2004), "Demography of Soybean
Aphid at Summer Temperatures", J. Econ. Entomol. 97(3):854**.
Extract: base temperature, optimal temperature, upper developmental threshold,
and the intrinsic rate of increase (r_m) at 20/25/30°C if reported.
Known: base 8.6°C, optimum 27.8°C, upper 34.9°C (modified Logan), peak growth 25°C.
Cross-check against Zhang et al. on white clover (base 8.27°C, ~90.9 DD nymph→adult).

### R2. Economic threshold derivation
Primary source: **Ragsdale et al. (2007)** — the paper behind the 250 threshold.
Extract: the ET formula, its inputs (crop price, control cost, yield, population
growth rate), and the 273 aphids/plant value with 7-day lead time.
**This matters most.** If you can recover the actual ET equation, the product
recomputes thresholds from live prices instead of using a static 250. That is the
core differentiator. Get this equation.

### R3. Sequential sampling / speed scouting
Primary source: **Hodgson, Burkness, Hutchison & Ragsdale (2004), "Enumerative and
Binomial Sequential Sampling Plans for Soybean Aphid", J. Econ. Entomol. 97(6):2127-2136**.
Extract: the binomial sampling decision boundaries and the operating characteristic
curve. Known summary: plant is "infested" at ≥40 aphids; sample 11 plants;
≤6 positives → do not treat; 11 → treat; 7–10 → keep sampling.
Use this to compute the actual error rate of a decision, not a guess.

### R4. Count overdispersion parameter
Search: Taylor's power law aphid spatial distribution; negative binomial k for
*Aphis glycines*. Needed for the Monte Carlo. If you can't find a published k,
default to k=1.5 and mark it `# UNVERIFIED` in code.

### R5. Natural-enemy-adjusted threshold
Source: **Zhang & Swinton**, "Incorporating natural enemies in an economic threshold
for dynamically optimal pest management", Ecological Modelling.
Extract the functional form of the predator adjustment if tractable. Fall back to
the Maryland extension rule (below) if the paper is paywalled.

### R6. Weather API
Use **Open-Meteo** (open-meteo.com). Free, no API key, historical + forecast in one
call. Confirm the endpoint returns `temperature_2m_max` / `temperature_2m_min` daily
arrays for both past dates and a 14-day forecast. Write a thin client with caching.

### R7. Validation data — stretch goal
Look for any published soybean aphid seasonal population time series (counts by
date, ideally with location). University extension annual pest reports and the
"Model fitting of the seasonal population dynamics of *Aphis glycines*"
(ScienceDirect) paper are starting points. Even 2–3 real season curves let you
backtest. If found, put them in `data/validation/`.

---

## Part 2 — Parameter table (verify, then hardcode with citations)

| Constant | Value | Source |
|---|---|---|
| `T_BASE_C` | 8.6 | McCornack et al. 2004 |
| `T_OPT_C` | 27.8 | McCornack et al. 2004 (modified Logan) |
| `T_MAX_C` | 34.9 | McCornack et al. 2004 (modified Logan) |
| `ET_APHIDS_PER_PLANT` | 250 | Ragsdale et al. 2007; requires ≥80% plants infested AND population increasing |
| `EIL_APHIDS_PER_PLANT` | 674 | Economic injury level |
| `ET_EARLY_R6` | 400–500 | Provisional per UNL CropWatch |
| Post mid-late R6 | no treatment benefit documented | Do not emit a spray recommendation |
| `LEAD_TIME_DAYS` | 5–7 | Time the ET buys to schedule treatment |
| Doubling time | 2–3 days under favorable conditions | Use to bound `rho` |
| `SPEED_SCOUT_INFESTED_AT` | 40 aphids/plant | Hodgson et al. 2004 |
| Predator sufficiency | ≥1 predator per 50 aphids | Maryland IPM Threshold Guide (small grains, tillering: 150 aphids/row-ft AND <1 predator/50 aphids) |

Derived bound: at 25°C, DD/day ≈ 16.4, so doubling in 2–3 days implies
`rho ∈ [0.014, 0.021]` per DD. **Reject any estimated rho > 0.025 as a data-entry
error** and surface it to the user.

---

## Part 3 — The model

Forecast in **physiological time (degree-days), not calendar days**, then convert
back to a date using the weather forecast.

### 3.1 Daily degree-days — modified average method
```
if Tmin < T_BASE: Tmin = T_BASE
if Tmax > T_MAX:  Tmax = T_MAX          # horizontal cutoff
DD = max(0, (Tmax + Tmin)/2 - T_BASE)
```

### 3.2 Temperature suitability multiplier (Brière-1)
Linear DD accumulation over-predicts growth in heat — McCornack found aphids needed
MORE degree-days at 30°C, and nymphs at 35°C died without completing development.
So modulate:
```
phi(T) = a * T * (T - T_BASE) * sqrt(T_MAX - T)   for T_BASE < T < T_MAX, else 0
```
Normalize so `phi(T_OPT) = 1`. Apply to the per-DD growth rate.

### 3.3 Growth rate estimation
Given observations at accumulated degree-days S1, S2 with counts N1, N2:
```
rho_hat = ln(N2 / N1) / (S2 - S1)
```

### 3.4 Shrinkage — this is the ML content
With n=2 noisy counts, `rho_hat` is unusable raw. Shrink toward a literature prior:
```
prior:     rho_0 ~ Normal(0.012, 0.006), truncated to [0, 0.025]
posterior: precision-weighted blend of rho_hat and rho_0
```
Observation precision scales with `(S2 - S1)` and with `n_plants_sampled` — a wider
DD gap and a bigger sample earn more weight. Implement as a small hierarchical
model: field-level rho shrinks toward a regional/seasonal mean. With one observation
you return the prior; the interval collapses as visits accumulate. **Expose the
interval width — it is a product feature, not a caveat.**

### 3.5 Predator suppression
```
ratio = predator_count / aphid_count
suppression = min(1.0, ratio / (1/50))
rho_eff = rho * (1 - suppression)
```
At ≥1 predator per 50 aphids, treat the population as held. Flag this in the output
as a distinct reason code so the UI can say "natural enemies are handling this."

### 3.6 Solve for crossing
```
S_star = S_last + ln(ET / N_last) / rho_eff
```
Then walk the forecast day by day, accumulating DD, until reaching `S_star`.
That day is the crossing date.

### 3.7 Monte Carlo (required — do not ship a point estimate)
1000 draws. Per draw: sample counts from NegBinom(mean=observed, k), sample rho
from its posterior, perturb forecast temps (±2°C Gaussian is adequate).
Output the distribution of crossing dates.

---

## Part 4 — Interfaces

```python
@dataclass
class Observation:
    field_id: str
    date: date
    count_per_plant: float
    n_plants_sampled: int
    pct_plants_infested: float
    predator_count: float
    growth_stage: str          # "V6", "R3", "R5", "R6"...

@dataclass
class Forecast:
    p_cross_within_7d: float
    median_cross_date: date | None
    cross_date_ci80: tuple[date, date] | None
    recommended_action_date: date | None   # median_cross - LEAD_TIME
    rho_per_dd: float
    rho_ci: tuple[float, float]
    reason_code: str    # BELOW_THRESHOLD | PREDATOR_SUPPRESSED | CROSSING_SOON |
                        # ABOVE_THRESHOLD | INSUFFICIENT_DATA | STAGE_PAST_BENEFIT |
                        # IMPLAUSIBLE_GROWTH
    citations: list[str]

def forecast_crossing(
    observations: list[Observation],
    lat: float, lon: float,
    crop_price: float, spray_cost_per_acre: float,
) -> Forecast
```

**Guard rails, all must be enforced:**
- `len(observations) < 2` → `INSUFFICIENT_DATA`, return prior-based estimate with wide CI
- growth stage past mid-late R6 → `STAGE_PAST_BENEFIT`, never recommend spraying
- `pct_plants_infested < 80` → cannot trigger ET even if count is high (the threshold is a conjunction)
- estimated rho > 0.025 → `IMPLAUSIBLE_GROWTH`, ask the scout to re-check
- population flat or declining → never recommend spray

---

## Part 5 — Build order

1. `weather.py` — Open-Meteo client, historical + forecast, cached to disk
2. `phenology.py` — degree-day accumulation, Brière multiplier, unit-tested
3. `growth.py` — rho estimation with shrinkage
4. `thresholds.py` — threshold table as JSON, with the Ragsdale ET equation if R2 succeeded
5. `forecast.py` — Monte Carlo, assembles `Forecast`
6. `cli.py` — takes a JSON observation list, prints the verdict. Frontend calls this.

---

## Part 6 — Tests (write these, they are the demo's credibility)

- **Doubling sanity:** counts 100 → 200 across ~40 DD should yield rho ≈ 0.017
- **Heat suppression:** identical counts, one field at 32°C mean and one at 25°C — the hot field must forecast a LATER crossing, not earlier
- **Predator suppression:** 180 aphids with 4 predators must return `PREDATOR_SUPPRESSED`
- **Monotonicity:** higher current count ⇒ earlier crossing date, always
- **Cold start:** single observation returns a CI at least 3x wider than the two-observation case
- **Conjunction:** count 300, `pct_plants_infested=60` must NOT trigger a spray recommendation

---

## Part 7 — Do NOT build

- Computer vision / image counting
- User auth, database, deployment
- More than 3 crop-pest pairs
- Live USDA price API — take price as a function argument
- Anything past mid-late R6 logic beyond the guard rail

---

## Part 8 — Deliverable

A working `forecast_crossing()` plus a one-line demo:

```
$ python cli.py demo.json
Field: North 40 | Soybean R3
Jul 20: 95/plant -> Jul 24: 180/plant  (rho = 0.0143/DD, 80% CI 0.009-0.020)
Threshold 250 (Ragsdale et al. 2007)
DON'T SPRAY. 78% chance of crossing within 7 days.
Median crossing: Jul 29 (80% CI Jul 27 - Aug 3)
Book the sprayer for Jul 27.
```

Every number on that screen must trace to a citation in code.

---

## Implementation note (added during build)

Built in **TypeScript**, not Python, at the user's direction. Module names map
`weather.py → src/weather.ts` and so on. Three parameters in Part 2 were corrected
by research — see `NOTES.md` for the corrections and their sources.
