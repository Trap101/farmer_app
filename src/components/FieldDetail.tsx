import { useState } from 'react'
import { motion } from 'framer-motion'
import type { Field } from '../data/fields'
import { LiveFeed } from './LiveFeed'
import { WeatherPanel } from './WeatherPanel'

interface Props {
  field: Field
  onBack: () => void
}

type CalcState = 'idle' | 'loading' | 'done'

export function FieldDetail({ field, onBack }: Props) {
  const [calcState, setCalcState] = useState<CalcState>('idle')

  async function handleCalculate() {
    setCalcState('loading')
    // TODO(ml-team): call the spray-date prediction API here, e.g.
    //   const res = await fetch('/api/predict', { method: 'POST', body: ... })
    // For the demo we simulate the round-trip.
    await new Promise((r) => setTimeout(r, 1800))
    setCalcState('done')
  }

  return (
    <motion.div
      layoutId={`field-${field.id}`}
      className="detail"
      transition={{ type: 'spring', stiffness: 240, damping: 30 }}
    >
      <motion.div
        className="detail-inner"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1, transition: { delay: 0.18, duration: 0.3 } }}
        exit={{ opacity: 0, transition: { duration: 0.1 } }}
      >
        <header className="detail-header">
          <button className="back-btn" onClick={onBack}>
            ← All fields
          </button>
          <div className="detail-title">
            <h2>{field.name}</h2>
            <span className="detail-subtitle">
              {field.crop} · {field.acres} acres · Fresno County, CA
            </span>
          </div>
          <div className="detail-badges">
            <span className={`badge badge-${field.pestRisk.toLowerCase()}`}>
              Pest risk: {field.pestRisk}
            </span>
            <span className="badge badge-neutral">
              Health {field.health}%
            </span>
          </div>
        </header>

        <div className="detail-grid">
          <LiveFeed field={field} />
          <WeatherPanel />
        </div>

        <footer className="detail-footer">
          <div className="footer-note">
            {calcState === 'done' ? (
              <span className="calc-result">
                ✓ Optimal window identified — prediction model will populate
                this once connected.
              </span>
            ) : (
              <span>
                Last sprayed {field.lastSprayed}. Model combines feed imagery +
                weather to find the optimal window.
              </span>
            )}
          </div>
          <button
            className={`calc-btn ${calcState === 'loading' ? 'calc-btn-loading' : ''}`}
            onClick={handleCalculate}
            disabled={calcState === 'loading'}
          >
            {calcState === 'loading' ? (
              <>
                <span className="spinner" aria-hidden />
                Analyzing field conditions…
              </>
            ) : calcState === 'done' ? (
              'Recalculate next spray date'
            ) : (
              'Calculate next spray date'
            )}
          </button>
        </footer>
      </motion.div>
    </motion.div>
  )
}
