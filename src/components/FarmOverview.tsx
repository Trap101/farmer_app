import { motion } from 'framer-motion'
import type { Field } from '../data/fields'
import { FieldCard } from './FieldCard'

interface Props {
  fields: Field[]
  activeFieldId: string | null
  onSelect: (field: Field) => void
}

export function FarmOverview({ fields, activeFieldId, onSelect }: Props) {
  return (
    <motion.div
      className="overview"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
    >
      <header className="overview-header">
        <div className="brand">
          <img className="brand-mark" src="/logo.png" alt="" aria-hidden />
          <div>
            <h1>SpraySense</h1>
            <p className="brand-sub">Sunrise Valley Farm · Fresno County, CA</p>
          </div>
        </div>
      </header>

      <div className="field-map-wrap">
        <div className="field-map">
          {fields.map((field) => (
            <FieldCard
              key={field.id}
              field={field}
              isActive={field.id === activeFieldId}
              onSelect={onSelect}
            />
          ))}
        </div>
      </div>
    </motion.div>
  )
}
