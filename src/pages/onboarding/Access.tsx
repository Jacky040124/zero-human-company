import { useRef } from 'react'
import type { KeyboardEvent, PointerEvent } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { OnboardingLayout } from './OnboardingLayout'
import { useDemo } from '../../state/DemoContext'
import type { AccessLevel } from '../../state/DemoContext'
import type { BobbyExpression } from '../../components/Bobby'

const LEVELS: AccessLevel[] = ['conservative', 'balanced', 'autopilot']

const LEVEL_LABEL: Record<AccessLevel, string> = {
  conservative: 'Conservative',
  balanced: 'Balanced',
  autopilot: 'Autopilot',
}

const SUMMARY: Record<AccessLevel, string> = {
  conservative: 'I check in before every move. Follow-ups are the only thing I run alone.',
  balanced: 'I run the routine. You approve inspections, contracts, and anything under the floor.',
  autopilot: "I run the desk. You'll hear from me when a contract is ready — or the floor would break.",
}

const BOBBY: Record<AccessLevel, { expression: BobbyExpression; line: string }> = {
  conservative: {
    expression: 'neutral',
    line: "I'll check in before every move. Your call, boss.",
  },
  balanced: {
    expression: 'happy',
    line: 'I run the routine, you approve the big swings.',
  },
  autopilot: {
    expression: 'cool',
    line: "Autopilot. You'll hear from me when there's a contract 😎",
  },
}

const ACTIONS = [
  'Send first outreach',
  'Follow-ups & replies',
  'Concede price above floor',
  'Go below floor',
  'Schedule factory inspection',
  'Send contract for signature',
] as const

type Permission = 'auto' | 'ask' | 'never'

const MATRIX: Record<AccessLevel, Record<(typeof ACTIONS)[number], Permission>> = {
  conservative: {
    'Send first outreach': 'ask',
    'Follow-ups & replies': 'auto',
    'Concede price above floor': 'ask',
    'Go below floor': 'ask',
    'Schedule factory inspection': 'ask',
    'Send contract for signature': 'ask',
  },
  balanced: {
    'Send first outreach': 'auto',
    'Follow-ups & replies': 'auto',
    'Concede price above floor': 'auto',
    'Go below floor': 'ask',
    'Schedule factory inspection': 'ask',
    'Send contract for signature': 'ask',
  },
  autopilot: {
    'Send first outreach': 'auto',
    'Follow-ups & replies': 'auto',
    'Concede price above floor': 'auto',
    'Go below floor': 'ask',
    'Schedule factory inspection': 'auto',
    'Send contract for signature': 'auto',
  },
}

const CHIP: Record<Permission, { label: string; className: string }> = {
  auto: { label: 'Auto', className: 'bg-good-soft text-good' },
  ask: { label: 'Asks you first', className: 'bg-warn-soft text-warn' },
  never: { label: 'Never', className: 'bg-hover text-muted' },
}

function levelFromClientX(clientX: number, width: number, left: number) {
  const pct = (clientX - left) / width
  if (pct < 1 / 3) return 0
  if (pct < 2 / 3) return 1
  return 2
}

function AccessSlider({
  value,
  onChange,
}: {
  value: AccessLevel
  onChange: (next: AccessLevel) => void
}) {
  const trackRef = useRef<HTMLDivElement>(null)
  const dragging = useRef(false)
  const index = LEVELS.indexOf(value)

  const applyFromPointer = (event: PointerEvent<HTMLDivElement>) => {
    const track = trackRef.current
    if (!track) return
    const rect = track.getBoundingClientRect()
    const next = LEVELS[levelFromClientX(event.clientX, rect.width, rect.left)]
    if (next && next !== value) onChange(next)
  }

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'ArrowRight' || event.key === 'ArrowUp') {
      event.preventDefault()
      onChange(LEVELS[Math.min(index + 1, LEVELS.length - 1)])
    } else if (event.key === 'ArrowLeft' || event.key === 'ArrowDown') {
      event.preventDefault()
      onChange(LEVELS[Math.max(index - 1, 0)])
    } else if (event.key === 'Home') {
      event.preventDefault()
      onChange('conservative')
    } else if (event.key === 'End') {
      event.preventDefault()
      onChange('autopilot')
    }
  }

  return (
    <div>
      <div
        ref={trackRef}
        role="slider"
        tabIndex={0}
        aria-valuemin={0}
        aria-valuemax={2}
        aria-valuenow={index}
        aria-valuetext={LEVEL_LABEL[value]}
        aria-label="Access level"
        onKeyDown={onKeyDown}
        onPointerDown={(event) => {
          dragging.current = true
          event.currentTarget.setPointerCapture(event.pointerId)
          applyFromPointer(event)
        }}
        onPointerMove={(event) => {
          if (!dragging.current) return
          applyFromPointer(event)
        }}
        onPointerUp={() => {
          dragging.current = false
        }}
        className="relative h-10 cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
      >
        <div className="absolute top-1/2 right-2 left-2 h-1 -translate-y-1/2 rounded-full bg-line" />
        {LEVELS.map((level, stopIndex) => (
          <button
            key={level}
            type="button"
            onClick={() => onChange(level)}
            className="absolute top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-0 bg-line"
            style={{ left: `${(stopIndex / 2) * 100}%` }}
            aria-label={LEVEL_LABEL[level]}
          />
        ))}
        <motion.div
          layoutId="access-knob"
          className="pointer-events-none absolute top-1/2 h-5 w-5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-accent"
          animate={{ left: `${(index / 2) * 100}%` }}
          transition={{ type: 'spring', stiffness: 420, damping: 32 }}
        />
      </div>
      <div className="mt-1 grid grid-cols-3 text-xs text-muted">
        {LEVELS.map((level, stopIndex) => (
          <p
            key={level}
            className={stopIndex === 1 ? 'text-center' : stopIndex === 2 ? 'text-right' : 'text-left'}
          >
            {LEVEL_LABEL[level]}
          </p>
        ))}
      </div>
    </div>
  )
}

export function Access() {
  const { accessLevel, setAccessLevel } = useDemo()
  const bobby = BOBBY[accessLevel]

  return (
    <OnboardingLayout
      step={5}
      title={bobby.line}
      nextTo="/app/buyers"
      nextLabel="Open the workspace"
      bobbyExpression={bobby.expression}
    >
      <div className="max-w-2xl">
        <AccessSlider value={accessLevel} onChange={setAccessLevel} />
        <AnimatePresence mode="wait">
          <motion.p
            key={accessLevel}
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.18 }}
            className="mt-4 text-sm leading-relaxed text-muted"
          >
            {SUMMARY[accessLevel]}
          </motion.p>
        </AnimatePresence>

        <div className="mt-8 overflow-hidden rounded-xl border border-line bg-bg">
          {ACTIONS.map((action, index) => {
            const permission = MATRIX[accessLevel][action]
            const chip = CHIP[permission]
            return (
              <div
                key={action}
                className={`flex items-center justify-between gap-4 px-4 py-3 ${
                  index > 0 ? 'border-t border-line' : ''
                }`}
              >
                <p className="text-sm text-ink">{action}</p>
                <AnimatePresence mode="wait">
                  <motion.span
                    key={`${accessLevel}-${permission}`}
                    initial={{ opacity: 0, y: 4 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -4 }}
                    transition={{ duration: 0.16 }}
                    className={`rounded px-2 py-0.5 text-[0.72rem] font-medium ${chip.className}`}
                  >
                    {chip.label}
                  </motion.span>
                </AnimatePresence>
              </div>
            )
          })}
        </div>
      </div>
    </OnboardingLayout>
  )
}
