import { useState } from 'react'
import { motion } from 'framer-motion'
import type { Field } from '../data/fields'
import { LiveFeed } from './LiveFeed'
import { WeatherPanel } from './WeatherPanel'
import { ScoutPanel } from './ScoutPanel'
import { SprayPlan } from './SprayPlan'
import { runForecast, type Forecast, type Observation } from '../api'

interface Props {
  field: Field
  onBack: () => void
}

// Grower economics. The whole point of the engine is that the threshold moves
// with these, so they are inputs rather than constants baked into a component.
const CROP_PRICE = 10.5 // $/bu
const SPRAY_COST = 22.0 // $/acre, insecticide + application
const YIELD_POTENTIAL = 50 // bu/acre
// Pinned so the Monte Carlo gives the same answer twice in a demo.
const SEED = 20260724

export function FieldDetail({ field, onBack }: Props) {
  const [observations, setObservations] = useState<Observation[]>([])
  const [forecast, setForecast] = useState<Forecast | null>(null)
  const [running, setRunning] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const engine = field.engine

  async function handleCalculate() {
    if (!engine) return
    setRunning(true)
    setError(null)
    try {
      setForecast(
        await runForecast({
          lat: engine.lat,
          lon: engine.lon,
          crop_price: CROP_PRICE,
          spray_cost_per_acre: SPRAY_COST,
          yield_potential_bu_ac: YIELD_POTENTIAL,
          seed: SEED,
          observations,
        }),
      )
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
      setForecast(null)
    } finally {
      setRunning(false)
    }
  }

  return (
    <motion.div
      layoutId={`field-${field.id}`}
      className="detail"
      transition={{ type: 'spring', stiffness: 240, damping: 30 }}
    >
      <motion.div
        className={`detail-inner ${forecast ? 'detail-inner-scroll' : ''}`}
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
              {field.crop} · {field.acres} acres ·{' '}
              {engine ? engine.location : 'Fresno County, CA'}
              {engine && ` · ${engine.growthStage}`}
            </span>
          </div>
          <div className="detail-badges">
            <span className={`badge badge-${field.pestRisk.toLowerCase()}`}>
              Pest risk: {field.pestRisk}
            </span>
            <span className="badge badge-neutral">Health {field.health}%</span>
          </div>
        </header>

        <div className="detail-grid">
          <LiveFeed field={field} />
          {engine ? (
            <ScoutPanel
              engine={engine}
              observations={observations}
              onConfirm={(o) => {
                // Chronological: the engine derives growth from consecutive visits.
                setObservations((prev) =>
                  [...prev, o].sort((a, b) => a.date.localeCompare(b.date)),
                )
                setForecast(null)
              }}
              onRemove={(i) => {
                setObservations((prev) => prev.filter((_, j) => j !== i))
                setForecast(null)
              }}
            />
          ) : (
            <WeatherPanel />
          )}
        </div>

        {engine && forecast && (
          <div className="detail-plan">
            <SprayPlan
              forecast={forecast}
              sprayCostPerAcre={SPRAY_COST}
              acres={field.acres}
            />
          </div>
        )}

        <footer className="detail-footer">
          <div className="footer-note">
            {!engine ? (
              <span>
                {field.crop} is not modelled — the forecast engine's thermal
                constants are soybean-aphid-specific. Open{' '}
                <strong>South Flat</strong> for the live spray forecast.
              </span>
            ) : error ? (
              <span className="calc-error">
                {error}
                {/failed|fetch|network/i.test(error) && (
                  <> — is the engine running? <code>npm run serve</code></>
                )}
              </span>
            ) : observations.length === 0 ? (
              <span>
                Photograph a filled-in scout sheet to begin. Threshold is
                recomputed from ${CROP_PRICE.toFixed(2)}/bu and $
                {SPRAY_COST.toFixed(2)}/acre — not the 250/plant rule of thumb.
              </span>
            ) : (
              <span>
                {observations.length} visit{observations.length > 1 ? 's' : ''}{' '}
                confirmed. Last sprayed {field.lastSprayed}.
              </span>
            )}
          </div>
          {engine && (
            <button
              className={`calc-btn ${running ? 'calc-btn-loading' : ''}`}
              onClick={handleCalculate}
              disabled={running || observations.length === 0}
            >
              {running ? (
                <>
                  <span className="spinner" aria-hidden />
                  Running forecast…
                </>
              ) : forecast ? (
                'Recalculate spray plan'
              ) : observations.length === 0 ? (
                'Add a scout sheet first'
              ) : (
                'Calculate next spray date'
              )}
            </button>
          )}
        </footer>
      </motion.div>
    </motion.div>
  )
}
