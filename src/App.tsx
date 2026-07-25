import { useState } from 'react'
import { AnimatePresence } from 'framer-motion'
import { FarmOverview } from './components/FarmOverview'
import { FieldDetail } from './components/FieldDetail'
import { FIELDS, type Field } from './data/fields'

export default function App() {
  const [activeField, setActiveField] = useState<Field | null>(null)

  // The overview stays mounted underneath; the detail view is an overlay
  // sharing the clicked card's layoutId, so Framer Motion animates the
  // card's box up to fullscreen (and back on close).
  return (
    <div className="app">
      <FarmOverview
        fields={FIELDS}
        activeFieldId={activeField?.id ?? null}
        onSelect={(field) => field.demoEnabled && setActiveField(field)}
      />
      <AnimatePresence>
        {activeField && (
          <FieldDetail
            key={activeField.id}
            field={activeField}
            onBack={() => setActiveField(null)}
          />
        )}
      </AnimatePresence>
    </div>
  )
}
