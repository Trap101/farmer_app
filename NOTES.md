# Where the research overrode the brief

The brief said not to trust its parameter table blindly. Five entries turned out to
be wrong or misattributed. Each correction below is in the code with its citation.

---

## 1. The ET equation — recovered, and it is not the form the brief assumed

The brief expected the Pedigo form `EIL = C/(V·I·D·K)`. Ragsdale et al. 2007 used a
gain threshold feeding a cumulative-aphid-day (CAD) → yield regression instead.
There is no separate injury or damage coefficient — the regression slope is both.

```
GT_pct     = C / (V · Y) · 100                          Eq. 1
EIL_CAD    = (99.85 − (100 − GT_pct)) / 6.88 · 10000    Eq. 2, Fig. 3 regression
EIL_aphids = (EIL_CAD · (λ − 1) + 1) / λ                Eq. 4, series starts at a = 1
ET_aphids  = EIL_aphids · λ^(−lead_days)                stated in the text, p. 1263
```

λ = 1.138/day. The 7-day lead collapses to a constant multiplier λ⁻⁷ = 0.405.

`test/thresholds.test.ts` reproduces the paper's whole 36-cell factorial: mean EIL
672.8 (published 674), mean 7-day ET 272.4 (273), EIL range 275–1398 (275–1399), ET
range 111–566 (111–567), lead ladder 591/457/353/272 (592/458/354/273). Everything
agrees to better than 0.25% — the residual is rounding in the paper's own published
coefficients (β₀ = 99.85, β₁ = 6.88), which cannot be inverted back to the
unrounded originals.

**This is the differentiator.** The threshold is computed from the grower's actual
price and spray cost, not looked up.

**The 250 is not derived from the EIL.** It is the 2003 NCSRP consensus action
threshold, which this paper *validated* — Ragsdale's own derived ET is 273. The
output reports both so nobody mistakes one for the other.

Source: https://soybeanresearchinfo.com/wp-content/uploads/2019/03/Aphid_economicthreshold.pdf

## 2. The growth-rate prior was ~1.6x too fast — it used lab doubling, not field

The brief derived `rho ∈ [0.014, 0.021]` per DD from "doubling in 2–3 days."

Two problems. The lab figure is faster than that (McCornack measured **1.5 d** at
25 °C), and the field figure is far slower: Ragsdale measured **6.8 ± 0.8 d** across
19 location-years, r = 0.127/day.

Using lab doubling times is a named, documented failure mode. Hodgson et al. 2012
(JIPM 3(1), p. 4): lab rates are "only obtainable under ideal environmental
conditions", and "basing an ET on population doubling times derived from laboratory
or even caged experiments will result in an extremely low ET" — i.e. over-treatment,
which is the exact behaviour this product exists to prevent.

Prior is now `Normal(0.0095, 0.0046)` per effective DD, from the field rate.
`RHO_IMPLAUSIBLE = 0.025` is kept as the data-entry reject: it is a 2.1-day
doubling, faster than the fastest of Ragsdale's 19 location-years.

The conversion between per-day and per-degree-day runs through
`REF_EFF_DD_PER_DAY = 13.4`, which is the single most load-bearing assumption in the
prior and is a named calibration knob rather than a buried literal.

## 3. The Brière-1 multiplier cannot fit the data, and the brief's own test proves it

The brief specified Brière-1 with `T_MAX = 34.9`, normalised at `T_OPT = 27.8`, and
separately required a test where a 32 °C field forecasts a **later** crossing than a
25 °C field. Those two requirements contradict each other:

| T | DD/day | phi (as specified) | growth ∝ DD × phi |
|---|---|---|---|
| 25 °C | 16.4 | 0.898 | 14.72 |
| 32 °C | 23.4 | 0.887 | **20.76** ← faster |

Three separate faults:

1. **Wrong curve.** 27.8 °C / 34.9 °C describe *development rate*. Population growth
   peaks at **25 °C**. Aphids continue developing at temperatures where the
   population is shrinking.
2. **Inconsistent normalisation.** Brière-1 with those parameters peaks at 28.93 °C,
   not 27.8 °C, so normalising at `T_OPT` lets `phi` exceed 1.
3. **Wrong functional family.** Measured growth relative to the 25 °C peak is 0.79 at
   20 °C and 0.79 at 30 °C — near-symmetric. Brière-1 is strongly left-skewed. Fitted
   with `T_MAX = 30` it nails 20 °C but forces growth to zero at 30 °C; fitted with
   `T_MAX = 35` it puts the peak at 29 °C and predicts 30 °C outgrows 25 °C. **No
   choice of `T_MAX` fits both shoulders.**

Replaced with interpolation over McCornack's measured doubling times (1.9 d at
20 °C, 1.5 d at 25 °C, 1.9 d at 30 °C, no development at 35 °C), with `phi` defined
so that `degree-days × phi ∝ r_m`:

```
phi(T) ∝ r_m(T) / (T − T_BASE)
```

Without that division temperature is applied twice — once through degree-day
accumulation, again through the multiplier — which is the root cause of fault 1.
The result peaks at 25 °C, declines monotonically above it, and reproduces the
measured 0.79 ratios at both 20 °C and 30 °C. More accurate and less code than
fitting a curve of the wrong family.

## 4. `k` is not a constant — the brief's `UNVERIFIED` default is unnecessary

The brief said to default to `k = 1.5` and mark it unverified. Two published Taylor's
power law fits exist for whole-plant *A. glycines* counts. Using the Minnesota one
(`a = 9.157`, `b = 1.543`, Hodgson et al. 2004) — same paper as the sampling plan, so
the count model and the decision rule stay internally consistent.

`k = m²/(a·m^b − m)`, which rises with density: 0.60 at m = 40, 0.90 at 100, **1.37
at the threshold**, 1.88 at 500. A fixed 1.5 is wrong at both ends. Illinois
(`a = 6.399`, `b = 1.718`) is the pessimistic sensitivity case.

## 5. The predator ratio is borrowed from small grains — no soybean equivalent exists

1 predator per 50 aphids comes from the **University of Maryland IPM Threshold
Guide** for *wheat at tillering*. There is no published soybean-aphid threshold
expressed as a predator:aphid ratio; UMN, Iowa State, SDSU and UNL all publish the
flat 250/80%/increasing rule and describe natural enemies only qualitatively.

Kept, because two independent lines corroborate it for soybean — UMD's own scouting
page gives "1 natural enemy per 50–100 aphids", and Zhang & Swinton's soybean
dynamic program implies roughly 1:67 — but it is labelled as borrowed in the code and
in every forecast's citation list.

The rigorous soybean approach is Hallett et al. 2014's Natural Enemy Units (1 NEU =
100 aphids consumed), which weights each predator species by its measured consumption
rate. That needs per-species scout counts this interface does not collect, so it is
not implemented.

---

## Other corrections

- The white clover cross-check is **Chen et al. 2017**, not "Zhang et al." Its values
  (8.27 °C, 90.91 DD) are correct and support the 8.6 °C base temperature.
- McCornack tested **20/25/30/35 °C**. There was no 15 °C treatment.
- The Speed Scouting stop lines in the brief are the **first row of five**; the plan
  extends to 31 plants. Not implemented — out of scope per Part 7.
- "80% of plants infested" (any aphids, the ET conjunction) and "84% of plants
  infested" (≥40 aphids each, Speed Scouting) are **different definitions of
  infested** for the same 250 aphids/plant mean. Mixing them silently misreads a
  scout's sheet.

## Deliberately not done

- **`pct_plants_infested` → mean density conversion.** The binomial regression
  coefficients are paywalled, and the two candidate link functions (`ln(1−p)` vs
  `−ln(1−p)`) give materially different answers. One verified anchor point
  (p = 0.837 ↔ m = 250 at a tally threshold of 40) cannot identify two parameters.
  Guessing here would be silently wrong rather than loudly wrong, so
  `pct_plants_infested` is used only for the ≥80% conjunction gate.
- **Backtesting against a real season curve.** No free machine-readable
  aphids-per-plant time series appears to exist. The KBS LTER suction-trap data
  (https://lter.kbs.msu.edu/datatables/122.csv) is real and downloadable but counts
  **alate flights, not per-plant density** — its huge September peak is the fall
  migration to buckthorn and has no analogue in a density curve. Usable for arrival
  timing, not for threshold crossing. The nearest per-plant data is figures-only in
  Costamagna & Landis (J. Insect Sci. 10:144) and would have to be hand-digitised.
- **Anything past mid-late R6** beyond the guard rail, per Part 7.

## Known ceilings

- `recommended_action_date` is the 10th percentile of the crossing distribution, not
  the brief's `median − LEAD_TIME`. For a crossing inside the lead time that formula
  returns a date already in the past; the 10th percentile is what the brief's own
  worked example actually shows.
- The Monte Carlo perturbs forecast temperature with one offset per draw rather than
  independent daily noise, because forecast bias is correlated across days and
  independent noise would average away and understate the uncertainty.
- Everything is calibrated for soybean aphid on soybean. The threshold equations
  generalise; the thermal constants do not.
