import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import { Funnel, FunnelChart, LabelList, ResponsiveContainer } from 'recharts'
import { useDemo } from '../../state/DemoContext'

const EASE = [0.16, 1, 0.3, 1] as const

const STAGE_FILL = {
  found: '#9b9a97',
  contacted: '#e89d01',
  negotiating: '#097fe8',
  contract: '#0f7b6c',
} as const

export function Dashboard() {
  const { leads, activity } = useDemo()
  const reduceMotion = Boolean(useReducedMotion())

  const stats = useMemo(() => {
    let inConversation = 0
    let negotiating = 0
    let contracts = 0
    for (const lead of leads) {
      if (lead.status === 'contacted') inConversation += 1
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

  const funnel = useMemo(() => {
    let contacted = 0
    let negotiating = 0
    let contract = 0
    for (const lead of leads) {
      if (lead.status === 'contacted' || lead.status === 'negotiating' || lead.status === 'contract') {
        contacted += 1
      }
      if (lead.status === 'negotiating' || lead.status === 'contract') negotiating += 1
      if (lead.status === 'contract') contract += 1
    }
    return [
      { name: 'Found', value: leads.length, fill: STAGE_FILL.found, label: `Found  ${leads.length}` },
      { name: 'Contacted', value: contacted, fill: STAGE_FILL.contacted, label: `Contacted  ${contacted}` },
      { name: 'Negotiating', value: negotiating, fill: STAGE_FILL.negotiating, label: `Negotiating  ${negotiating}` },
      { name: 'Contract', value: contract, fill: STAGE_FILL.contract, label: `Contract  ${contract}` },
    ]
  }, [leads])

  const needsYou = useMemo(
    () => leads.filter((lead) => lead.status === 'contract'),
    [leads],
  )

  return (
    <div>
      <h1 className="text-3xl font-semibold tracking-tight text-ink">Dashboard</h1>
      <p className="mt-1 text-sm text-muted">What the agent is doing right now.</p>

      <div className="mt-6 grid grid-cols-4 gap-3">
        <StatCard label="Buyers found" value={stats.found} />
        <StatCard label="In conversation" value={stats.inConversation} />
        <StatCard label="Negotiating" value={stats.negotiating} />
        <StatCard label="Contracts" value={stats.contracts} />
      </div>

      {needsYou.length > 0 ? (
        <div className="mt-5 rounded-xl border border-black/8 bg-bg px-4 py-3">
          <p className="text-[0.65rem] font-medium uppercase tracking-widest text-muted">
            Needs you
          </p>
          {needsYou.map((lead) => (
            <Link
              key={lead.id}
              to={`/app/leads/${lead.id}/contract`}
              className="mt-1.5 block text-sm text-ink no-underline hover:text-accent"
            >
              {lead.company} is ready to sign →
            </Link>
          ))}
        </div>
      ) : null}

      <div className="mt-5 grid grid-cols-3 gap-3">
        <div className="col-span-2 rounded-xl border border-black/8 bg-bg px-4 py-3">
          <p className="text-[0.65rem] font-medium uppercase tracking-widest text-muted">
            Funnel
          </p>
          <div className="mt-1 h-[260px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <FunnelChart margin={{ top: 12, right: 120, left: 12, bottom: 12 }}>
                <Funnel
                  data={funnel}
                  dataKey="value"
                  nameKey="name"
                  lastShapeType="rectangle"
                  legendType="none"
                  tooltipType="none"
                  stroke="#ffffff"
                  isAnimationActive={reduceMotion ? false : 'auto'}
                >
                  <LabelList
                    dataKey="label"
                    position="right"
                    fill="#191918"
                    stroke="none"
                    offset={14}
                  />
                </Funnel>
              </FunnelChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="rounded-xl border border-black/8 bg-bg px-4 py-3">
          <p className="text-[0.65rem] font-medium uppercase tracking-widest text-muted">
            Live
          </p>
          <div className="mt-1.5">
            <AnimatePresence initial={false}>
              {activity.slice(0, 4).map((item) => (
                <motion.p
                  key={item.id}
                  initial={reduceMotion ? false : { opacity: 0, y: -6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={reduceMotion ? undefined : { opacity: 0 }}
                  transition={{ duration: 0.3, ease: EASE }}
                  className="flex items-baseline gap-3 py-1.5 text-sm text-ink"
                >
                  <span className="shrink-0 font-mono text-[0.65rem] tabular-nums text-faint">
                    {item.time}
                  </span>
                  <span className="min-w-0">{item.text}</span>
                </motion.p>
              ))}
            </AnimatePresence>
          </div>
        </div>
      </div>
    </div>
  )
}

function StatCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl border border-black/8 bg-bg px-4 py-4">
      <p className="text-3xl font-semibold tracking-tight tabular-nums text-ink">{value}</p>
      <p className="mt-1.5 text-[0.65rem] font-medium uppercase tracking-widest text-muted">
        {label}
      </p>
    </div>
  )
}
