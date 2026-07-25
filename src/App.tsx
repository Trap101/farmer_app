import { useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { LandingPage } from './components/LandingPage'
import { FarmOverview } from './components/FarmOverview'
import { FieldDetail } from './components/FieldDetail'
import { FIELDS, type Field } from './data/fields'

type Screen = 'landing' | 'dashboard'

export default function App() {
  const [screen, setScreen] = useState<Screen>('landing')
  const [activeField, setActiveField] = useState<Field | null>(null)

  if (screen === 'landing') {
    return (
      <div className="app">
        <LandingPage onEnter={() => setScreen('dashboard')} />
      </div>
    )
  }

  // The overview stays mounted underneath; the detail view is an overlay
  // sharing the clicked card's layoutId, so Framer Motion animates the
  // card's box up to fullscreen (and back on close).
  return (
    <motion.div
      className="app"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.35 }}
    >
      <FarmOverview
        fields={FIELDS}
        activeFieldId={activeField?.id ?? null}
        onSelect={(field) => field.demoEnabled && setActiveField(field)}
        onHome={() => {
          setActiveField(null)
          setScreen('landing')
        }}
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
    </motion.div>
  )
}
