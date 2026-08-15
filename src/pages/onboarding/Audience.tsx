import { useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { audience, audiencePins } from '../../data'
import { OnboardingLayout } from './OnboardingLayout'

const DEFAULT_ON = ['importers', 'hospitality']

const PIN_COLOR: Record<string, string> = {
  importers: '#0075de',
  hospitality: '#e89d01',
  retail: '#9b9a97',
}

function EuropeBlob() {
  return (
    <path
      d="M92 68 C72 48 96 26 138 24 C176 16 228 20 276 48 C318 70 338 112 328 154 C334 196 308 228 286 246 C268 286 236 314 198 302 C176 292 168 252 148 238 C108 226 68 198 58 156 C48 116 62 88 92 68 Z"
      fill="#efece4"
      stroke="#d8d4c8"
      strokeWidth="1.6"
    />
  )
}

function MapPin({
  city,
  x,
  y,
  color,
}: {
  city: string
  x: number
  y: number
  color: string
}) {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.6 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.6 }}
      transition={{ duration: 0.22 }}
      className="absolute -translate-x-1/2 -translate-y-1/2"
      style={{ left: `${x}%`, top: `${y}%` }}
    >
      <span className="relative flex h-2 w-2">
        <motion.span
          className="absolute inline-flex h-full w-full rounded-full"
          style={{ background: color }}
          animate={{ scale: [1, 2.6, 1], opacity: [0.55, 0, 0.55] }}
          transition={{ duration: 1.8, repeat: Infinity, ease: 'easeOut' }}
        />
        <span className="relative inline-flex h-2 w-2 rounded-full" style={{ background: color }} />
      </span>
      <p className="absolute top-3 left-1/2 -translate-x-1/2 whitespace-nowrap text-[0.6rem] text-graphite">
        {city}
      </p>
    </motion.div>
  )
}

export function Audience() {
  const [selected, setSelected] = useState<string[]>(DEFAULT_ON)
  const retailOn = selected.includes('retail')

  const toggle = (id: string) => {
    setSelected((current) =>
      current.includes(id) ? current.filter((item) => item !== id) : [...current, id],
    )
  }

  const voice = retailOn
    ? {
        expression: 'excited' as const,
        line: 'Ambitious. I like it. But let the importers vouch for you first.',
      }
    : {
        expression: 'happy' as const,
        line: 'This is my hunting map. Blue dots first 🗺️',
      }

  return (
    <OnboardingLayout
      step={4}
      title={voice.line}
      nextTo="/onboarding/access"
      nextLabel="Hunt there →"
      bobbyExpression={voice.expression}
      bobbyLineKey={voice.line}
    >
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,0.8fr)]">
        <div className="overflow-hidden rounded-xl border border-line bg-bg p-4">
          <div className="relative">
            <svg viewBox="0 0 400 360" className="h-full w-full" aria-hidden>
              <EuropeBlob />
            </svg>
            <div className="absolute inset-0">
              <AnimatePresence>
                {audiencePins
                  .filter((pin) => selected.includes(pin.segment))
                  .map((pin) => (
                    <MapPin
                      key={pin.id}
                      city={pin.city}
                      x={pin.x}
                      y={pin.y}
                      color={PIN_COLOR[pin.segment]}
                    />
                  ))}
              </AnimatePresence>
            </div>
          </div>
        </div>

        <div className="flex flex-col gap-3">
          {audience.map((segment) => {
            const active = selected.includes(segment.id)
            return (
              <button
                key={segment.id}
                type="button"
                onClick={() => toggle(segment.id)}
                className={`flex cursor-pointer items-center justify-between rounded-xl border border-line bg-bg px-4 py-4 text-left transition-opacity ${
                  active ? 'opacity-100' : 'opacity-50'
                }`}
              >
                <div>
                  <p className="text-sm font-semibold tracking-tight text-ink">
                    {segment.shortLabel}
                  </p>
                  <p className="mt-0.5 text-xs text-muted">{segment.hint}</p>
                </div>
                <span
                  className={`flex h-5 w-5 items-center justify-center rounded-sm text-[0.65rem] ${
                    active ? 'bg-accent text-white' : 'border border-line text-muted'
                  }`}
                >
                  {active ? '✓' : ''}
                </span>
              </button>
            )
          })}
        </div>
      </div>
    </OnboardingLayout>
  )
}
