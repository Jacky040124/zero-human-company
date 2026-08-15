import { useState } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import { audienceCandidates, defaultAudienceIds } from '../../data'
import type { AudienceCandidate, AudienceSegment } from '../../data'
import type { BobbyExpression } from '../../components/Bobby'
import { OnboardingLayout } from './OnboardingLayout'

const EASE = [0.16, 1, 0.3, 1] as const

const SEGMENT_LABEL: Record<AudienceSegment, string> = {
  importer: 'Importer',
  hotel: 'Hotel FF&E',
  retail: 'Retail',
}

const SEGMENT_CHIP: Record<AudienceSegment, string> = {
  importer: 'bg-accent-soft text-accent',
  hotel: 'bg-warn-soft text-warn',
  retail: 'bg-hover text-muted',
}

const MONOGRAM = [
  'bg-sky-wash text-white',
  'bg-peach text-graphite',
  'bg-mocha text-white',
  'bg-accent-soft text-accent',
  'bg-marigold text-ink',
  'bg-good-soft text-good',
  'bg-warn-soft text-warn',
  'bg-hover text-muted',
] as const

function voiceFor(selected: string[]): { expression: BobbyExpression; line: string } {
  if (selected.length === 0) {
    return { expression: 'worried', line: 'Give me at least one to chase 😅' }
  }

  const retailOn = audienceCandidates.some(
    (candidate) => candidate.segment === 'retail' && selected.includes(candidate.id),
  )
  if (retailOn) {
    return {
      expression: 'excited',
      line: 'Ambitious. I like it. But let the importers vouch for you first.',
    }
  }

  return {
    expression: 'happy',
    line: 'Found 8 buyers worth waking up for. Pick my starting lineup 🎯',
  }
}

function CandidateCard({
  candidate,
  index,
  selected,
  reduceMotion,
  onToggle,
}: {
  candidate: AudienceCandidate
  index: number
  selected: boolean
  reduceMotion: boolean
  onToggle: () => void
}) {
  return (
    <motion.div
      initial={reduceMotion ? false : { opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.07, duration: 0.35, ease: EASE }}
    >
      <motion.button
        type="button"
        aria-pressed={selected}
        onClick={onToggle}
        whileTap={reduceMotion ? undefined : { scale: 0.98 }}
        className={`relative flex w-full cursor-pointer flex-col items-start rounded-xl border bg-bg p-3.5 text-left ${
          selected ? 'border-accent opacity-100' : 'border-line opacity-60'
        }`}
      >
        <span
          className={`flex h-8 w-8 items-center justify-center rounded-md text-sm font-semibold ${MONOGRAM[index]}`}
        >
          {candidate.company[0]}
        </span>

        <p className="mt-3 text-sm font-semibold tracking-tight text-ink">{candidate.company}</p>
        <p className="mt-0.5 text-xs text-muted">
          {candidate.city} · {candidate.country}
        </p>

        <span
          className={`mt-2.5 rounded-sm px-1.5 py-0.5 text-[0.62rem] font-medium ${SEGMENT_CHIP[candidate.segment]}`}
        >
          {candidate.segment === 'retail' ? 'later' : SEGMENT_LABEL[candidate.segment]}
        </span>

        <p className="mt-2 text-[0.7rem] leading-snug text-graphite">{candidate.why}</p>

        <AnimatePresence>
          {selected && (
            <motion.span
              initial={reduceMotion ? false : { scale: 0.4, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={reduceMotion ? undefined : { scale: 0.4, opacity: 0 }}
              transition={{ type: 'spring', stiffness: 340, damping: 24 }}
              className="absolute top-2.5 right-2.5 flex h-5 w-5 items-center justify-center rounded-sm bg-accent text-[0.65rem] text-white"
              aria-hidden
            >
              ✓
            </motion.span>
          )}
        </AnimatePresence>
      </motion.button>
    </motion.div>
  )
}

export function Audience() {
  const reduceMotion = Boolean(useReducedMotion())
  const [selected, setSelected] = useState<string[]>(defaultAudienceIds)
  const voice = voiceFor(selected)

  const toggle = (id: string) => {
    setSelected((current) =>
      current.includes(id) ? current.filter((item) => item !== id) : [...current, id],
    )
  }

  return (
    <OnboardingLayout
      step={4}
      title={voice.line}
      nextTo="/onboarding/access"
      nextLabel="Hunt these →"
      hideCta={selected.length === 0}
      bobbyExpression={voice.expression}
    >
      <p className="mb-4 text-sm text-muted">
        Bobby starts with{' '}
        <span className="font-semibold tabular-nums text-ink">{selected.length}</span> of 8
      </p>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {audienceCandidates.map((candidate, index) => (
          <CandidateCard
            key={candidate.id}
            candidate={candidate}
            index={index}
            selected={selected.includes(candidate.id)}
            reduceMotion={reduceMotion}
            onToggle={() => toggle(candidate.id)}
          />
        ))}
      </div>
    </OnboardingLayout>
  )
}
