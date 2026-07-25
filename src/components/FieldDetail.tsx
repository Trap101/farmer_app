import { useEffect, useRef, useState } from 'react'
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
  const planRef = useRef<HTMLDivElement>(null)
  // Skip the empty-mount run; only forecast after the scout confirms (or removes) visits.
  const skipAuto = useRef(true)

  const engine = field.engine

  async function runPlan(obs: Observation[]) {
    if (!engine || obs.length === 0) {
      setForecast(null)
      return
    }
    setRunning(true)
    setError(null)
    setForecast(null)
    try {
      const next = await runForecast({
        lat: engine.lat,
        lon: engine.lon,
        crop_price: CROP_PRICE,
        spray_cost_per_acre: SPRAY_COST,
        yield_potential_bu_ac: YIELD_POTENTIAL,
        seed: SEED,
        observations: obs,
      })
      setForecast(next)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
      setForecast(null)
    } finally {
      setRunning(false)
    }
  }

  useEffect(() => {
    if (skipAuto.current) {
      skipAuto.current = false
      return
    }
    void runPlan(observations)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional: only when visits change
  }, [observations])

  useEffect(() => {
    if (forecast && planRef.current) {
      planRef.current.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
    }
  }, [forecast])

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
              }}
              onRemove={(i) => {
                setObservations((prev) => prev.filter((_, j) => j !== i))
              }}
            />
          ) : (
            <WeatherPanel />
          )}
        </div>

        {engine && running && !forecast && (
          <div className="plan-loading" role="status">
            <span className="spinner" aria-hidden />
            Working out spray / re-scout / dollars…
          </div>
        )}

        {engine && forecast && (
          <div className="detail-plan" ref={planRef}>
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
                Photograph a filled-in scout sheet. You&apos;ll get a clear
                answer on spray, re-scout, and dollars saved — threshold from $
                {CROP_PRICE.toFixed(2)}/bu and ${SPRAY_COST.toFixed(2)}/acre.
              </span>
            ) : running ? (
              <span>Updating the plan from your latest visit…</span>
            ) : (
              <span>
                {observations.length} visit{observations.length > 1 ? 's' : ''}{' '}
                confirmed. Last sprayed {field.lastSprayed}.
              </span>
            )}
          </div>
          {engine && observations.length > 0 && (
            <button
              className={`calc-btn ${running ? 'calc-btn-loading' : ''}`}
              onClick={() => void runPlan(observations)}
              disabled={running}
            >
              {running ? (
                <>
                  <span className="spinner" aria-hidden />
                  Updating…
                </>
              ) : (
                'Recalculate'
              )}
            </button>
          )}
        </footer>
      </motion.div>
    </motion.div>
  )
}
