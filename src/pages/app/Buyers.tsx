import { useMemo, useState } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import { featuredLeadId, leadStatusLabel, statusLabel } from '../../data'
import type { Lead, LeadStatus } from '../../data'
import { LeadModal } from '../../components/LeadModal'
import { LeadProgress } from '../../components/LeadProgress'
import { LiveDot, StatusPill } from '../../components/ui'
import { useDemo } from '../../state/DemoContext'

const EASE = [0.16, 1, 0.3, 1] as const

const COLUMNS: { status: LeadStatus; dot: string }[] = [
  { status: 'sourcing', dot: 'bg-stage-sourcing' },
  { status: 'contacted', dot: 'bg-stage-contacted' },
  { status: 'negotiating', dot: 'bg-stage-negotiating' },
  { status: 'contract', dot: 'bg-stage-contract' },
]

const spring = { type: 'spring' as const, stiffness: 320, damping: 30 }

const STATUS_RANK: Record<LeadStatus, number> = {
  contract: 0,
  negotiating: 1,
  contacted: 2,
  sourcing: 3,
}

const STATUS_DOT: Record<LeadStatus, string> = {
  sourcing: 'bg-stage-sourcing',
  contacted: 'bg-stage-contacted',
  negotiating: 'bg-stage-negotiating',
  contract: 'bg-stage-contract',
}

type View = 'board' | 'list'

export function Buyers() {
  const { leads, autopilot, apiConnected, runtimeError } = useDemo()
  const reduceMotion = Boolean(useReducedMotion())
  const [openId, setOpenId] = useState<string | null>(null)
  const [view, setView] = useState<View>('list')

  const grouped = useMemo(() => {
    const map: Record<LeadStatus, Lead[]> = {
      sourcing: [],
      contacted: [],
      negotiating: [],
      contract: [],
    }
    for (const lead of leads) {
      map[lead.status].push(lead)
    }
    for (const status of Object.keys(map) as LeadStatus[]) {
      map[status].sort((a, b) => {
        if (a.id === featuredLeadId) return -1
        if (b.id === featuredLeadId) return 1
        return 0
      })
    }
    return map
  }, [leads])

  const sorted = useMemo(
    () => [...leads].sort((a, b) => STATUS_RANK[a.status] - STATUS_RANK[b.status]),
    [leads],
  )

  const openLead = openId ? (leads.find((lead) => lead.id === openId) ?? null) : null
  const reconnecting = runtimeError === 'Live updates are reconnecting'

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight text-ink">Pipeline</h1>
          <p className="mt-1 text-sm text-muted">
            {apiConnected
              ? 'Persisted run pipeline'
              : runtimeError
                ? 'Offline · local preview pipeline'
                : 'Local preview pipeline'}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex rounded-lg bg-canvas p-0.5">
            {(['board', 'list'] as const).map((option) => (
              <button
                key={option}
                type="button"
                onClick={() => setView(option)}
                aria-pressed={view === option}
                className={`cursor-pointer rounded-md border-0 px-2.5 py-1 text-xs capitalize transition-colors ${
                  view === option
                    ? 'bg-bg font-medium text-ink shadow-[0_1px_2px_rgba(15,15,15,0.08)]'
                    : 'bg-transparent text-muted hover:text-ink'
                }`}
              >
                {option}
              </button>
            ))}
          </div>
          <StatusPill tone={reconnecting || Boolean(runtimeError) || (!apiConnected && !autopilot) ? 'warn' : 'live'}>
            {apiConnected && reconnecting ? (
              'Persisted snapshot · reconnecting'
            ) : apiConnected ? (
              <>
                <LiveDot />
                Persisted API snapshot
              </>
            ) : runtimeError ? (
              'Offline · local preview'
            ) : autopilot ? (
              <>
                <LiveDot />
                Local preview · Autopilot on
              </>
            ) : (
              'Local preview · Autopilot paused'
            )}
          </StatusPill>
        </div>
      </div>

      {view === 'list' ? (
        <div className="mt-6 divide-y divide-line overflow-hidden rounded-lg border border-black/8 bg-bg">
          <AnimatePresence initial={false}>
            {sorted.map((lead) => {
              const featured = !apiConnected && (lead.featured || lead.id === featuredLeadId)
              return (
                <motion.button
                  key={lead.id}
                  type="button"
                  layout={!reduceMotion}
                  initial={reduceMotion ? false : { opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={reduceMotion ? undefined : { opacity: 0 }}
                  transition={
                    reduceMotion
                      ? { duration: 0 }
                      : { layout: spring, opacity: { duration: 0.25, ease: EASE } }
                  }
                  onClick={() => setOpenId(lead.id)}
                  className="flex w-full cursor-pointer items-center gap-3 border-0 bg-bg px-4 py-2.5 text-left hover:bg-hover"
                >
                  <span
                    className={`h-1.5 w-1.5 shrink-0 rounded-full ${STATUS_DOT[lead.status]}`}
                  />
                  <span className="w-44 shrink-0 truncate text-sm font-medium text-ink">
                    {lead.company}
                    {featured ? (
                      <span className="ml-1.5 rounded-full bg-accent-soft px-1.5 py-0.5 text-[0.6rem] font-medium text-accent">
                        new reply
                      </span>
                    ) : null}
                  </span>
                  <span className="hidden w-40 shrink-0 truncate text-xs text-faint md:block">
                    {lead.city}, {lead.country}
                  </span>
                  <span className="min-w-0 flex-1">
                    <LeadProgress lead={lead} interactive={false} showLabels={false} />
                  </span>
                  <span className="w-24 shrink-0 text-right text-xs text-muted">
                    {leadStatusLabel(lead)}
                  </span>
                </motion.button>
              )
            })}
          </AnimatePresence>
        </div>
      ) : (
      <div className="mt-6 grid grid-cols-4 gap-3">
        {COLUMNS.map((column) => {
          const cards = grouped[column.status]
          return (
            <div key={column.status} className="min-w-0 rounded-lg bg-canvas p-2">
              <p className="flex items-center gap-1.5 px-1 pb-2 text-[0.68rem] font-medium text-muted">
                <span className={`h-1.5 w-1.5 rounded-full ${column.dot}`} />
                {statusLabel[column.status]}
                <span className="ml-auto tabular-nums text-faint">{cards.length}</span>
              </p>
              <div className="space-y-1.5">
                <AnimatePresence initial={false}>
                  {cards.map((lead) => {
                    const featured = !apiConnected && (lead.featured || lead.id === featuredLeadId)
                    return (
                      <motion.button
                        key={lead.id}
                        type="button"
                        layout={!reduceMotion}
                        layoutId={reduceMotion ? undefined : lead.id}
                        initial={reduceMotion ? false : { opacity: 0, y: 8 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={reduceMotion ? undefined : { opacity: 0 }}
                        transition={
                          reduceMotion
                            ? { duration: 0 }
                            : { layout: spring, opacity: { duration: 0.25, ease: EASE } }
                        }
                        onClick={() => setOpenId(lead.id)}
                        className="w-full cursor-pointer rounded-lg border border-black/8 bg-bg px-2.5 py-2 text-left"
                      >
                        <p className="flex items-center gap-1.5 text-sm font-medium text-ink">
                          <span className="truncate">{lead.company}</span>
                          {featured ? (
                            <span className="shrink-0 rounded-full bg-accent-soft px-1.5 py-0.5 text-[0.6rem] font-medium text-accent">
                              new reply
                            </span>
                          ) : null}
                        </p>
                        <p className="mt-0.5 truncate text-[0.65rem] text-faint">{lead.city}</p>
                        {lead.runtimeStage === 'PAUSED' || lead.runtimeStage === 'LOST' ? (
                          <p className="mt-1 text-[0.62rem] font-medium text-warn">
                            {leadStatusLabel(lead)}
                          </p>
                        ) : null}
                      </motion.button>
                    )
                  })}
                </AnimatePresence>
              </div>
            </div>
          )
        })}
      </div>
      )}

      {openLead ? <LeadModal lead={openLead} onClose={() => setOpenId(null)} /> : null}
    </div>
  )
}
