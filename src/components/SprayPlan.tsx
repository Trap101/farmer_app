import {
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

type SprayAnswer = {
  answer: 'Yes' | 'No' | 'Book'
  detail: string
  tone: 'good' | 'caution' | 'bad' | 'neutral'
}

type RescoutAnswer = {
  answer: 'Yes' | 'No'
  detail: string
}

type MoneyAnswer = {
  dollars: number
  label: string
  detail: string
  tone: 'good' | 'caution' | 'bad' | 'neutral'
}

function sprayDecision(f: Forecast): SprayAnswer {
  switch (f.reason_code) {
    case 'ABOVE_THRESHOLD':
      return {
        answer: 'Yes',
        detail: 'Spray today — counts are at or above your economic threshold.',
        tone: 'bad',
      }
    case 'CROSSING_SOON':
      return {
        answer: 'Book',
        detail: `Do not spray today. Book the sprayer for ${formatDate(f.recommended_action_date)}.`,
        tone: 'caution',
      }
    case 'STAGE_PAST_BENEFIT':
      return {
        answer: 'No',
        detail: 'Past mid-late R6 — spraying will not add yield.',
        tone: 'good',
      }
    case 'PREDATOR_SUPPRESSED':
      return {
        answer: 'No',
        detail: 'Predators are holding the population. Hold the spray.',
        tone: 'good',
      }
    case 'BELOW_THRESHOLD':
      return {
        answer: 'No',
        detail: 'Below threshold and not crossing this week. Hold the spray.',
        tone: 'good',
      }
    case 'INSUFFICIENT_DATA':
      return {
        answer: 'No',
        detail: 'Not enough visits yet to justify a spray call.',
        tone: 'neutral',
      }
    case 'IMPLAUSIBLE_GROWTH':
      return {
        answer: 'No',
        detail: 'Counts look off — re-check before spraying.',
        tone: 'neutral',
      }
  }
}

function rescoutDecision(f: Forecast): RescoutAnswer {
  switch (f.reason_code) {
    case 'ABOVE_THRESHOLD':
      return { answer: 'No', detail: 'Act on the spray first; scout after.' }
    case 'CROSSING_SOON':
      return {
        answer: 'Yes',
        detail: 'Re-scout 2–3 days before the booked date to confirm.',
      }
    case 'INSUFFICIENT_DATA':
      return { answer: 'Yes', detail: 'Scout again in 3–5 days to lock in a growth rate.' }
    case 'IMPLAUSIBLE_GROWTH':
      return { answer: 'Yes', detail: 'Re-check counts and visit dates before acting.' }
    case 'STAGE_PAST_BENEFIT':
      return { answer: 'No', detail: 'Season window for spraying is closed.' }
    default:
      return { answer: 'Yes', detail: 'Re-scout in 5–7 days.' }
  }
}

/**
 * Grower-facing dollars. Holding off a pass = money saved. Spraying = cost of
 * the pass. If the 250 rule would have sprayed but the price-driven ET says
 * wait, call that out explicitly.
 */
function moneyDecision(
  f: Forecast,
  sprayCostPerAcre: number,
  acres: number,
): MoneyAnswer {
  const total = Math.round(sprayCostPerAcre * acres)
  const count = f.latest_count
  const et = f.threshold.et_aphids
  const consensus = f.threshold.et_consensus
  const consensusWouldSpray = Number.isFinite(et) && count >= consensus
  const holding =
    f.reason_code === 'BELOW_THRESHOLD' ||
    f.reason_code === 'PREDATOR_SUPPRESSED' ||
    f.reason_code === 'STAGE_PAST_BENEFIT' ||
    f.reason_code === 'CROSSING_SOON' ||
    f.reason_code === 'INSUFFICIENT_DATA'

  if (f.reason_code === 'ABOVE_THRESHOLD') {
    return {
      dollars: total,
      label: 'Cost of this spray',
      detail: `$${sprayCostPerAcre.toFixed(0)}/ac × ${acres} ac — spray while it still pays.`,
      tone: 'bad',
    }
  }

  if (holding && consensusWouldSpray && count < et) {
    return {
      dollars: total,
      label: 'Saved vs the 250 rule',
      detail: `${count.toFixed(0)}/plant is under your ${et.toFixed(0)} threshold, but the old 250 rule would have sprayed.`,
      tone: 'good',
    }
  }

  if (f.reason_code === 'CROSSING_SOON') {
    return {
      dollars: total,
      label: 'Held for now',
      detail: `Don't spend $${total.toLocaleString()} today — book for ${formatDate(f.recommended_action_date)}.`,
      tone: 'caution',
    }
  }

  if (f.reason_code === 'IMPLAUSIBLE_GROWTH') {
    return {
      dollars: total,
      label: 'At stake',
      detail: `Confirm counts before committing $${total.toLocaleString()} to a pass.`,
      tone: 'neutral',
    }
  }

  return {
    dollars: total,
    label: 'Saved by not spraying',
    detail: `A full-field pass would cost $${sprayCostPerAcre.toFixed(0)}/ac.`,
    tone: 'good',
  }
}

export function SprayPlan({ forecast: f, sprayCostPerAcre, acres }: Props) {
  const days = calendarDays()
  const book = canBookSprayer(f)
  const [ciLo, ciHi] = f.cross_date_ci80 ?? [null, null]
  const spray = sprayDecision(f)
  const rescout = rescoutDecision(f)
  const money = moneyDecision(f, sprayCostPerAcre, acres)

  return (
    <section className="panel plan-panel">
      <div className="panel-header">
        <h3>What to do</h3>
        <span className={`reason-chip reason-${toneFor(f.reason_code)}`}>
          {spray.answer === 'Yes'
            ? 'Spray now'
            : spray.answer === 'Book'
              ? 'Book sprayer'
              : 'Hold spray'}
        </span>
      </div>

      <p className="plan-message">{f.message}</p>

      <div className="decision-board" role="group" aria-label="Spray decisions">
        <Decision
          label="Spray today?"
          answer={spray.answer}
          detail={spray.detail}
          tone={spray.tone}
        />
        <Decision
          label="Re-scout needed?"
          answer={rescout.answer}
          detail={rescout.detail}
          tone={rescout.answer === 'Yes' ? 'caution' : 'good'}
        />
        <div className={`decision decision-${money.tone}`}>
          <span className="decision-label">{money.label}</span>
          <strong className="decision-money">
            ${money.dollars.toLocaleString()}
          </strong>
          <span className="decision-detail">{money.detail}</span>
        </div>
      </div>

      {(book || f.cross_date_ci80) && (
        <>
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
            {book && (
              <span>
                <i className="swatch swatch-book" /> book sprayer
              </span>
            )}
            <span>
              <i className="swatch swatch-median" /> median crossing
            </span>
            <span>
              <i className="swatch swatch-band" /> 80% interval
            </span>
          </div>
        </>
      )}

      <details className="plan-details">
        <summary>Show the numbers behind this</summary>
        <div className="plan-metrics">
          <Metric
            label="Your count"
            value={`${f.latest_count.toFixed(0)}/plant`}
            sub={`${Math.round(f.p_cross_within_7d * 100)}% chance of crossing in 7 days`}
          />
          <Metric
            label="Your threshold"
            value={`${Number.isFinite(f.threshold.et_aphids) ? f.threshold.et_aphids.toFixed(0) : '—'}/plant`}
            sub={thresholdSub(f)}
          />
          <Metric
            label="Crossing window"
            value={
              ciLo && ciHi
                ? `${formatDate(ciLo)} – ${formatDate(ciHi)}`
                : 'None in horizon'
            }
            sub={`median ${formatDate(f.median_cross_date)}`}
          />
          <Metric
            label="Spray cost"
            value={`$${sprayCostPerAcre.toFixed(2)}/ac`}
            sub={`$${(sprayCostPerAcre * acres).toFixed(0)} over ${acres} ac`}
          />
        </div>
      </details>

      <details className="citations">
        <summary>Sources ({f.citations.length})</summary>
        <ul>
          {f.citations.map((c) => (
            <li key={c}>{c}</li>
          ))}
        </ul>
      </details>
    </section>
  )
}

function Decision({
  label,
  answer,
  detail,
  tone,
}: {
  label: string
  answer: string
  detail: string
  tone: 'good' | 'caution' | 'bad' | 'neutral'
}) {
  return (
    <div className={`decision decision-${tone}`}>
      <span className="decision-label">{label}</span>
      <strong className="decision-answer">{answer}</strong>
      <span className="decision-detail">{detail}</span>
    </div>
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
  if (!f.cross_date_ci80) {
    return 'No threshold crossing predicted in the next two weeks.'
  }
  return `Threshold crossing predicted between ${f.cross_date_ci80[0]} and ${f.cross_date_ci80[1]}, median ${f.median_cross_date}.`
}
