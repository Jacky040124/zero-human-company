import { useMemo, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import type { Lead, LeadStatus } from '../../data'
import { LeadModal } from '../../components/LeadModal'
import { LeadProgress } from '../../components/LeadProgress'
import { useDemo } from '../../state/DemoContext'
import { RunControl } from '../../components/RunControl'

const statusRank: Record<LeadStatus, number> = {
  negotiating: 0,
  contract: 0,
  contacted: 1,
  sourcing: 2,
}

function sortPipeline(leads: Lead[]): Lead[] {
  return [...leads].sort((a, b) => {
    if (a.featured) return -1
    if (b.featured) return 1
    return statusRank[a.status] - statusRank[b.status]
  })
}

export function Dashboard() {
  const { leads, activity } = useDemo()
  const [openId, setOpenId] = useState<string | null>(null)

  const stats = useMemo(() => {
    let inConversation = 0
    let negotiating = 0
    let contracts = 0
    for (const lead of leads) {
      if (lead.status === 'contacted' || lead.status === 'negotiating') inConversation += 1
      if (lead.status === 'negotiating') negotiating += 1
      if (lead.status === 'contract') contracts += 1
    }
    return {
      found: leads.length,
      inConversation,
      negotiating,
      contracts,
    }
  }, [leads])

  const pipeline = useMemo(() => sortPipeline(leads), [leads])
  const openLead = openId ? (leads.find((lead) => lead.id === openId) ?? null) : null

  return (
    <div>
      <h1 className="text-3xl font-semibold text-ink">Dashboard</h1>
      <p className="mt-1 text-muted">
        Every EU buyer in motion, and how far each conversation has gone.
      </p>

      <RunControl />

      <div className="mt-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Buyers found" value={stats.found} />
        <StatCard label="In conversation" value={stats.inConversation} />
        <StatCard label="Negotiating" value={stats.negotiating} />
        <StatCard label="Contracts in review" value={stats.contracts} />
      </div>

      <div className="mt-5 rounded-lg border border-line px-4 py-3">
        <p className="text-xs text-muted">Live activity</p>
        <div className="mt-2 space-y-1.5">
          <AnimatePresence initial={false}>
            {activity.slice(0, 3).map((item) => (
              <motion.p
                key={item.id}
                initial={{ opacity: 0, y: -6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                className="text-sm text-ink"
              >
                <span className="mr-2 font-mono text-xs text-muted">{item.time}</span>
                {item.text}
              </motion.p>
            ))}
          </AnimatePresence>
        </div>
      </div>

      <h2 className="mt-8 text-sm font-medium text-ink">Pipeline</h2>
      <div className="mt-3 divide-y divide-line rounded-lg border border-line">
        <AnimatePresence initial={false}>
          {pipeline.map((lead) => (
            <motion.div
              key={lead.id}
              layout
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.35 }}
              onClick={() => setOpenId(lead.id)}
              className={`flex cursor-pointer flex-col items-stretch gap-3 px-3 py-3 hover:bg-hover sm:flex-row sm:items-center sm:gap-4 ${
                lead.featured ? 'border-l-2 border-l-accent bg-accent-soft/40' : ''
              }`}
            >
              <div className="w-full shrink-0 min-w-0 sm:w-44">
                <p className="truncate font-medium text-ink">{lead.company}</p>
                <p className="text-xs text-muted">
                  {lead.city}, {lead.country}
                </p>
              </div>
              <div className="min-w-0 flex-1">
                <LeadProgress lead={lead} onOpen={(item) => setOpenId(item.id)} />
              </div>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>

      {openLead ? <LeadModal lead={openLead} onClose={() => setOpenId(null)} /> : null}
    </div>
  )
}

function StatCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border border-line p-4">
      <p className="text-2xl font-semibold text-ink">{value}</p>
      <p className="mt-1 text-xs text-muted">{label}</p>
    </div>
  )
}
