import { motion } from 'framer-motion'
import type { Field } from '../data/fields'

interface Props {
  field: Field
  isActive: boolean
  onSelect: (field: Field) => void
}

// Flat fill per health band — no gradients, minimal look.
function healthColor(health: number): string {
  if (health >= 85) return '#3f9e3a'
  if (health >= 75) return '#59a344'
  return '#7da23c'
}

export function FieldCard({ field, isActive, onSelect }: Props) {
  // While the detail overlay owns this card's layoutId, render a plain
  // placeholder so two elements never share the id simultaneously.
  if (isActive) {
    return <div className="field-card" style={{ gridArea: field.gridArea, visibility: 'hidden' }} />
  }
  return (
    <motion.button
      layoutId={`field-${field.id}`}
      className={`field-card ${field.demoEnabled ? '' : 'field-card-locked'}`}
      style={{ gridArea: field.gridArea, backgroundColor: healthColor(field.health) }}
      onClick={() => onSelect(field)}
      whileHover={{ scale: 1.02 }}
      whileTap={field.demoEnabled ? { scale: 0.99 } : undefined}
      transition={{ type: 'spring', stiffness: 400, damping: 32 }}
      aria-label={`${field.name} — ${field.crop}, ${field.acres} acres`}
    >
      <div className="field-card-tag">
        <span className="field-card-name">{field.name}</span>
        <span className="field-card-crop">{field.crop}</span>
      </div>

      <div className="field-card-hover">
        <div className="hover-row">
          <span>Health</span>
          <strong>{field.health}%</strong>
        </div>
        <div className="hover-row">
          <span>Pest risk</span>
          <strong className={`risk-${field.pestRisk.toLowerCase()}`}>
            {field.pestRisk}
          </strong>
        </div>
        <span className="hover-cta">
          {field.demoEnabled ? 'Open live monitor →' : 'Offline (demo)'}
        </span>
      </div>

      {field.pestRisk === 'High' && (
        <span className="field-card-alert" title="High pest risk">
          !
        </span>
      )}
    </motion.button>
  )
}
