import { useRef, useState } from 'react'
import type { EngineConfig } from '../data/fields'
import {
  FORM_URL,
  fileToBase64,
  scoutOcr,
  type Observation,
  type ScoutOcrResponse,
} from '../api'

interface Props {
  engine: EngineConfig
  /** Visits already confirmed; the engine needs >=2 for a real growth rate. */
  observations: Observation[]
  onConfirm: (o: Observation) => void
  onRemove: (index: number) => void
}

type Stage = 'idle' | 'reading' | 'review' | 'error'

// Blank numeric field -> NaN rather than 0. A zero here would look like a real
// measurement; NaN keeps the Run button disabled until the scout fills it in.
const num = (s: string) => (s.trim() === '' ? NaN : Number(s))

export function ScoutPanel({ engine, observations, onConfirm, onRemove }: Props) {
  const [stage, setStage] = useState<Stage>('idle')
  const [error, setError] = useState<string | null>(null)
  const [warnings, setWarnings] = useState<string[]>([])
  const [draft, setDraft] = useState<Observation | null>(null)
  const [preview, setPreview] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  async function handleFile(file: File) {
    setStage('reading')
    setError(null)
    setWarnings([])
    setPreview(URL.createObjectURL(file))
    try {
      const base64 = await fileToBase64(file)
      const res: ScoutOcrResponse = await scoutOcr(base64, file.type || 'image/jpeg')
      setWarnings(res.warnings)
      // observation is null when the sheet is missing something the engine
      // cannot run without. Seed the form from whatever the sheet did give so
      // the scout corrects rather than retypes.
      setDraft(res.observation ?? blankFrom(res, engine))
      setStage('review')
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
      setStage('error')
    }
  }

  // Escape hatch: OCR down, key expired, or a scout who would rather type.
  // The same confirm gate applies, so nothing skips validation.
  function startManual() {
    setError(null)
    setWarnings([])
    setPreview(null)
    setDraft({ ...blankFrom(null, engine), growth_stage: engine.growthStage })
    setStage('review')
  }

  const complete = draft !== null && isComplete(draft)

  return (
    <section className="panel scout-panel">
      <div className="panel-header">
        <h3>Add a scout visit</h3>
        <a className="form-link" href={FORM_URL} target="_blank" rel="noreferrer">
          Print blank sheet ↗
        </a>
      </div>

      {observations.length > 0 && (
        <ul className="visit-list">
          {observations.map((o, i) => (
            <li key={`${o.date}-${i}`} className="visit-row">
              <span className="visit-date">{o.date}</span>
              <span className="visit-count">
                {o.count_per_plant.toFixed(0)}/plant
              </span>
              <span className="visit-meta">
                {o.pct_plants_infested.toFixed(0)}% infested · n={o.n_plants_sampled}
              </span>
              <button
                className="visit-remove"
                onClick={() => onRemove(i)}
                aria-label={`Remove visit ${o.date}`}
              >
                ×
              </button>
            </li>
          ))}
        </ul>
      )}

      {observations.length === 1 && (
        <p className="scout-hint">
          One visit gives a prior-driven forecast with a wide interval. A second
          visit is what produces a real growth rate.
        </p>
      )}

      {stage !== 'review' && (
        <>
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            capture="environment"
            className="visually-hidden"
            onChange={(e) => {
              const f = e.target.files?.[0]
              if (f) handleFile(f)
              e.target.value = '' // allow re-picking the same file
            }}
          />
          <button
            className="upload-btn"
            onClick={() => fileRef.current?.click()}
            disabled={stage === 'reading'}
          >
            {stage === 'reading' ? (
              <>
                <span className="spinner" aria-hidden />
                Transcribing sheet…
              </>
            ) : (
              <>📷 Photograph your scout sheet</>
            )}
          </button>
          {stage !== 'reading' && (
            <button className="manual-link" onClick={startManual}>
              or enter counts by hand
            </button>
          )}
          {stage === 'idle' && observations.length === 0 && (
            <p className="scout-hint">
              1. Print the blank sheet · 2. Count aphids in the field · 3.
              Photograph the filled sheet. Confirm the numbers, then you get
              spray / re-scout / dollars — not a plant photo analysis.
            </p>
          )}
        </>
      )}

      {stage === 'error' && (
        <p className="scout-error">
          {error}
          {error?.includes('GEMINI_API_KEY') && (
            <>
              {' '}
              — copy <code>.env.example</code> to <code>.env</code>, add the key,
              and restart <code>npm run serve</code>.
            </>
          )}
          {error?.includes("Can't reach") && (
            <>
              {' '}
              You can still add the visit by hand — the numbers are on the paper.
            </>
          )}
        </p>
      )}

      {stage === 'review' && draft && (
        <div className="review">
          {preview && (
            <img className="sheet-thumb" src={preview} alt="Photographed scout sheet" />
          )}

          {warnings.length > 0 && (
            <ul className="warn-list">
              {warnings.map((w) => (
                <li key={w}>{w}</li>
              ))}
            </ul>
          )}

          <p className="review-note">
            Transcribed — check every value against the paper. Nothing is guessed
            on your behalf, so blanks stay blank.
          </p>

          <div className="review-grid">
            <Num
              label="Date"
              text
              value={draft.date}
              onChange={(v) => setDraft({ ...draft, date: v })}
            />
            <Num
              label="Growth stage"
              text
              value={draft.growth_stage}
              onChange={(v) => setDraft({ ...draft, growth_stage: v })}
            />
            <Num
              label="Aphids / plant"
              value={draft.count_per_plant}
              onChange={(v) => setDraft({ ...draft, count_per_plant: num(v) })}
            />
            <Num
              label="Plants examined"
              value={draft.n_plants_sampled}
              hint="drives the confidence interval"
              onChange={(v) => setDraft({ ...draft, n_plants_sampled: num(v) })}
            />
            <Num
              label="% plants infested"
              value={draft.pct_plants_infested}
              hint="any aphids present"
              onChange={(v) => setDraft({ ...draft, pct_plants_infested: num(v) })}
            />
            <Num
              label="Predators / plant"
              value={draft.predator_count}
              onChange={(v) => setDraft({ ...draft, predator_count: num(v) })}
            />
          </div>

          <div className="review-actions">
            <button className="ghost-btn" onClick={() => setStage('idle')}>
              Discard
            </button>
            <button
              className="confirm-btn"
              disabled={!complete}
              onClick={() => {
                onConfirm({ ...draft, field_id: engine.fieldId })
                setDraft(null)
                setPreview(null)
                setWarnings([])
                setStage('idle')
              }}
            >
              {complete ? 'Confirm & get plan' : 'Fill the blanks to confirm'}
            </button>
          </div>
        </div>
      )}
    </section>
  )
}

function Num({
  label,
  value,
  onChange,
  hint,
  text,
}: {
  label: string
  value: number | string
  onChange: (v: string) => void
  hint?: string
  text?: boolean
}) {
  // NaN is the "scout has not supplied this" state — render it empty, not "NaN".
  const shown = typeof value === 'number' && Number.isNaN(value) ? '' : String(value)
  return (
    <label className={`review-field ${shown === '' ? 'review-field-missing' : ''}`}>
      <span className="review-label">{label}</span>
      <input
        className="review-input"
        type={text ? 'text' : 'number'}
        value={shown}
        placeholder={text ? '' : '—'}
        onChange={(e) => onChange(e.target.value)}
      />
      {hint && <span className="review-hint">{hint}</span>}
    </label>
  )
}

function isComplete(o: Observation): boolean {
  return (
    /^\d{4}-\d{2}-\d{2}$/.test(o.date) &&
    o.growth_stage.trim() !== '' &&
    [o.count_per_plant, o.n_plants_sampled, o.pct_plants_infested, o.predator_count].every(
      (n) => Number.isFinite(n),
    ) &&
    o.n_plants_sampled > 0
  )
}

/**
 * The sheet was readable but incomplete. Carry over what it did contain so the
 * scout only fills the gaps — NaN for anything the sheet did not state, because
 * a plausible default here silently narrows the forecast's interval.
 */
function blankFrom(res: ScoutOcrResponse | null, engine: EngineConfig): Observation {
  const s = res?.sheet
  return {
    field_id: engine.fieldId,
    date: s?.date ?? '',
    count_per_plant: NaN,
    n_plants_sampled: NaN,
    pct_plants_infested: NaN,
    predator_count: NaN,
    // Only pre-filled for hand entry, where the scout is reading their own
    // sheet and the field's stage is already known. Never inferred from OCR.
    growth_stage: s?.growth_stage ?? '',
  }
}
