import {
  REASON_LABEL,
  canBookSprayer,
  formatDate,
  toneFor,
  type Forecast,
} from '../api'

interface Props {
  forecast: Forecast
  sprayCostPerAcre: number
  acres: number
}

const DAY = 86_400_000
const utc = (iso: string) => Date.parse(iso + 'T00:00:00Z')

/** 14 days from today, so "today" is always the leftmost cell. */
function calendarDays(): string[] {
  const start = Date.now() - (Date.now() % DAY)
  return Array.from({ length: 14 }, (_, i) =>
    new Date(start + i * DAY).toISOString().slice(0, 10),
  )
}

export function SprayPlan({ forecast: f, sprayCostPerAcre, acres }: Props) {
  const days = calendarDays()
  const book = canBookSprayer(f)
  const [ciLo, ciHi] = f.cross_date_ci80 ?? [null, null]
  const tone = toneFor(f.reason_code)

  return (
    <section className="panel plan-panel">
      <div className="panel-header">
        <h3>Spray plan</h3>
        <span className={`reason-chip reason-${tone}`}>
          {REASON_LABEL[f.reason_code]}
        </span>
      </div>

      {/* Pre-written by the engine and safe to render verbatim. */}
      <p className="plan-message">{f.message}</p>

      <div className="plan-headline">
        {book ? (
          <>
            <span className="plan-headline-label">Book the sprayer for</span>
            <strong className="plan-headline-date">
              {formatDate(f.recommended_action_date)}
            </strong>
          </>
        ) : (
          <>
            <span className="plan-headline-label">
              {f.reason_code === 'ABOVE_THRESHOLD' ? 'Action' : 'No booking yet'}
            </span>
            <strong className="plan-headline-date plan-headline-hold">
              {f.reason_code === 'STAGE_PAST_BENEFIT'
                ? 'Crop past benefit'
                : 'Re-scout in 5–7 days'}
            </strong>
          </>
        )}
      </div>

      {/* 14-day strip. Band = 80% crossing interval, ring = median crossing,
          filled = the recommended booking date. */}
      <div className="calendar" role="img" aria-label={calendarLabel(f)}>
        {days.map((d) => {
          const t = utc(d)
          const inBand = ciLo && ciHi && t >= utc(ciLo) && t <= utc(ciHi)
          const isMedian = f.median_cross_date === d
          const isBook = book && f.recommended_action_date === d
          const isToday = d === days[0]
          return (
            <div
              key={d}
              className={[
                'cal-day',
                inBand ? 'cal-band' : '',
                isMedian ? 'cal-median' : '',
                isBook ? 'cal-book' : '',
                isToday ? 'cal-today' : '',
              ]
                .filter(Boolean)
                .join(' ')}
              title={`${d}${isBook ? ' — book sprayer' : ''}${
                isMedian ? ' — median crossing' : ''
              }`}
            >
              <span className="cal-dow">
                {new Date(t).toLocaleDateString('en-US', {
                  weekday: 'narrow',
                  timeZone: 'UTC',
                })}
              </span>
              <span className="cal-num">
                {new Date(t).toLocaleDateString('en-US', {
                  day: 'numeric',
                  timeZone: 'UTC',
                })}
              </span>
            </div>
          )
        })}
      </div>

      <div className="cal-legend">
        <span><i className="swatch swatch-book" /> book sprayer</span>
        <span><i className="swatch swatch-median" /> median crossing</span>
        <span><i className="swatch swatch-band" /> 80% interval</span>
      </div>

      <div className="plan-metrics">
        <Metric
          label="Crossing window"
          value={ciLo && ciHi ? `${formatDate(ciLo)} – ${formatDate(ciHi)}` : 'None in horizon'}
          sub={`median ${formatDate(f.median_cross_date)}`}
        />
        <Metric
          label="Chance within 7 d"
          value={`${Math.round(f.p_cross_within_7d * 100)}%`}
          sub={`latest count ${f.latest_count.toFixed(0)}/plant`}
        />
        <Metric
          label="Threshold applied"
          value={`${f.threshold.et_aphids.toFixed(0)}/plant`}
          sub={thresholdSub(f)}
        />
        <Metric
          label="Growth rate"
          value={`${f.rho_per_dd.toFixed(4)}/DD`}
          sub={`80% CI ${f.rho_ci[0].toFixed(4)}–${f.rho_ci[1].toFixed(4)}`}
        />
        <Metric
          label="Spray cost"
          value={`$${sprayCostPerAcre.toFixed(2)}/ac`}
          sub={`$${(sprayCostPerAcre * acres).toFixed(0)} over ${acres} ac`}
        />
        <Metric
          label="Break-even loss"
          value={`${f.threshold.gain_threshold_pct.toFixed(2)}%`}
          sub={`EIL ${f.threshold.eil_aphids.toFixed(0)}/plant`}
        />
      </div>

      <p className="plan-interval-note">
        The interval width is the point: a wider band means the next scouting
        visit is worth more.
      </p>

      <details className="citations">
        <summary>Sources for these numbers ({f.citations.length})</summary>
        <ul>
          {f.citations.map((c) => (
            <li key={c}>{c}</li>
          ))}
        </ul>
      </details>
    </section>
  )
}

function Metric({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <div className="plan-metric">
      <span className="plan-metric-label">{label}</span>
      <span className="plan-metric-value">{value}</span>
      <span className="plan-metric-sub">{sub}</span>
    </div>
  )
}

/**
 * 250/plant is a 2003 consensus rule that Ragsdale validated, not a figure
 * derived from the EIL — so it is reported as a separate comparison, never as
 * something this engine calculated.
 */
function thresholdSub(f: Forecast): string {
  const { et_computed, et_consensus, floored, basis } = f.threshold
  if (basis !== 'computed') return `${basis} rule · consensus ${et_consensus}`
  const delta = Math.round(et_computed - et_consensus)
  const sign = delta >= 0 ? '+' : '−'
  return `${sign}${Math.abs(delta)} vs the ${et_consensus} rule of thumb${
    floored ? ' · floored' : ''
  }`
}

function calendarLabel(f: Forecast): string {
  if (!f.cross_date_ci80) return 'No threshold crossing predicted in the next two weeks.'
  return `Threshold crossing predicted between ${f.cross_date_ci80[0]} and ${f.cross_date_ci80[1]}, median ${f.median_cross_date}.`
}
