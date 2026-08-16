import { useState } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import type { AudienceCandidate, AudienceSegment } from '../../data'
import type { BuyerSearchCompany } from '../../api/runtime'
import { useDemo } from '../../state/DemoContext'
import type { BobbyExpression } from '../../components/Bobby'
import { OnboardingLayout } from './OnboardingLayout'

const EASE = [0.16, 1, 0.3, 1] as const

type Phase = 'idle' | 'fetching' | 'done'

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

function toCandidate(company: BuyerSearchCompany): AudienceCandidate {
  const country = company.country?.trim() || 'Unknown'
  return {
    id: company.externalCompanyId,
    company: company.name,
    city: country,
    country,
    segment: 'importer',
    why: company.description?.trim()
      || (company.website ? `Apollo match · ${company.website}` : 'Apollo organization match'),
  }
}

function voiceFor(
  phase: Phase,
  candidates: AudienceCandidate[],
  selected: string[],
): { expression: BobbyExpression; line: string } {
  if (phase === 'idle') {
    return { expression: 'reading', line: 'Nobody on the list yet. Fetch me some buyers.' }
  }
  if (phase === 'fetching') {
    return { expression: 'reading', line: 'Writing a fresh Apollo query, then searching…' }
  }
  if (candidates.length === 0) {
    return { expression: 'worried', line: 'Apollo came back empty. Try again?' }
  }
  if (selected.length === 0) {
    return { expression: 'worried', line: 'Give me at least one to chase 😅' }
  }
  return {
    expression: 'happy',
    line: `Found ${candidates.length} buyers worth waking up for. Pick my starting lineup 🎯`,
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
  const location = candidate.city === candidate.country
    ? candidate.country
    : `${candidate.city} · ${candidate.country}`

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
          className={`flex h-8 w-8 items-center justify-center rounded-md text-sm font-semibold ${MONOGRAM[index % MONOGRAM.length]}`}
        >
          {candidate.company[0]}
        </span>

        <p className="mt-3 text-sm font-semibold tracking-tight text-ink">{candidate.company}</p>
        <p className="mt-0.5 text-xs text-muted">{location}</p>

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
  const { searchBuyers } = useDemo()
  const [phase, setPhase] = useState<Phase>('idle')
  const [candidates, setCandidates] = useState<AudienceCandidate[]>([])
  const [selected, setSelected] = useState<string[]>([])
  const [queryUsed, setQueryUsed] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const voice = voiceFor(phase, candidates, selected)

  const toggle = (id: string) => {
    setSelected((current) =>
      current.includes(id) ? current.filter((item) => item !== id) : [...current, id],
    )
  }

  const runFetch = async () => {
    setError(null)
    setPhase('fetching')
    try {
      const result = await searchBuyers({
        region: 'Europe',
        buyerType: 'importer',
        maxResults: 8,
      })
      const next = result.companies.map(toCandidate)
      setCandidates(next)
      setSelected(next.slice(0, Math.min(4, next.length)).map((item) => item.id))
      setQueryUsed(result.query)
      setPhase('done')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Apollo search failed')
      setPhase('idle')
    }
  }

  return (
    <OnboardingLayout
      step={4}
      title={voice.line}
      nextTo="/onboarding/access"
      nextLabel="Hunt these →"
      hideCta={phase !== 'done' || selected.length === 0}
      bobbyExpression={voice.expression}
    >
      {phase === 'done' ? (
        <div className="mb-4">
          <p className="text-sm text-muted">
            Bobby starts with{' '}
            <span className="font-semibold tabular-nums text-ink">{selected.length}</span>
            {' '}of {candidates.length}
          </p>
          {queryUsed ? (
            <p className="mt-1 text-xs text-faint">Apollo query · {queryUsed}</p>
          ) : null}
        </div>
      ) : null}

      {phase === 'idle' ? (
        <div className="mx-auto max-w-xl">
          <button
            type="button"
            onClick={() => { void runFetch() }}
            className="flex w-full cursor-pointer flex-col items-center rounded-xl border border-dashed border-line bg-bg px-6 py-16 transition-colors hover:bg-hover"
          >
            <p className="text-sm font-medium text-ink">Fetch buyers from Apollo</p>
            <p className="mt-1 text-xs text-muted">
              Monid will search live furniture importers. Nothing is messaged.
            </p>
          </button>
          {error ? <p className="mt-3 text-sm text-warn">{error}</p> : null}
        </div>
      ) : null}

      {phase === 'fetching' ? (
        <div className="mx-auto max-w-xl rounded-xl border border-black/8 bg-bg p-6 shadow-[0_4px_12px_rgba(15,15,15,0.08)]">
          <p className="text-lg font-semibold tracking-tight text-ink">Searching Apollo…</p>
          <p className="mt-1 text-sm text-muted">Monid is querying live organization search</p>
          <div className="mt-4 h-1.5 overflow-hidden rounded-full bg-black/8">
            <motion.div
              className="h-full rounded-full bg-accent"
              initial={{ width: '12%' }}
              animate={reduceMotion ? { width: '55%' } : { width: ['18%', '78%', '42%'] }}
              transition={reduceMotion ? { duration: 0 } : { duration: 2.4, repeat: Infinity, ease: 'easeInOut' }}
            />
          </div>
        </div>
      ) : null}

      {phase === 'done' ? (
        candidates.length === 0 ? (
          <div className="mx-auto max-w-xl">
            <button
              type="button"
              onClick={() => { void runFetch() }}
              className="flex w-full cursor-pointer flex-col items-center rounded-xl border border-dashed border-line bg-bg px-6 py-16 transition-colors hover:bg-hover"
            >
              <p className="text-sm font-medium text-ink">Fetch again</p>
              <p className="mt-1 text-xs text-muted">Apollo returned no companies for this query.</p>
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            {candidates.map((candidate, index) => (
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
        )
      ) : null}
    </OnboardingLayout>
  )
}
