import { Link } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { discoverySources, statusLabel } from '../../data'
import type { LeadStatus } from '../../data'
import { LiveDot, StatusPill } from '../../components/ui'
import { useDemo } from '../../state/DemoContext'

const tone: Record<LeadStatus, 'neutral' | 'live' | 'warn' | 'good'> = {
  sourcing: 'neutral',
  contacted: 'warn',
  negotiating: 'live',
  contract: 'good',
}

export function Buyers() {
  const { leads, activity, autopilot } = useDemo()

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs text-muted">Main agent</p>
          <h1 className="mt-1 text-3xl font-semibold tracking-tight text-ink">
            Discovering buyers
          </h1>
          <p className="mt-2 max-w-xl text-sm leading-relaxed text-muted">
            One worker per lead. The main agent keeps searching LinkedIn, Maps,
            customs filings, showrooms, and a dozen other sources while
            negotiations run in parallel.
          </p>
        </div>
        <StatusPill tone={autopilot ? 'live' : 'warn'}>
          {autopilot ? (
            <>
              <LiveDot />
              Searching 12 sources
            </>
          ) : (
            'Search paused'
          )}
        </StatusPill>
      </div>

      <div className="mt-5 flex flex-wrap gap-1.5">
        {discoverySources.map((source) => (
          <span
            key={source}
            className="rounded border border-line bg-bg px-2 py-0.5 text-[0.7rem] text-muted"
          >
            {source}
          </span>
        ))}
      </div>

      <div className="mt-6 rounded-lg border border-line bg-bg px-4 py-3">
        <p className="text-xs text-muted">Live activity</p>
        <div className="mt-2 space-y-1.5">
          <AnimatePresence initial={false}>
            {activity.slice(0, 4).map((item) => (
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

      <div className="mt-6 overflow-hidden rounded-lg border border-line bg-bg">
        <table className="w-full text-left text-sm">
          <thead className="text-xs font-normal text-muted">
            <tr>
              <th className="px-4 py-2 font-normal uppercase">Company</th>
              <th className="px-4 py-2 font-normal uppercase">Focus</th>
              <th className="px-4 py-2 font-normal uppercase">Status</th>
              <th className="px-4 py-2 font-normal uppercase">Worker</th>
              <th className="px-4 py-2 font-normal uppercase">Last action</th>
            </tr>
          </thead>
          <tbody>
            <AnimatePresence initial={false}>
              {leads.map((lead) => (
                <motion.tr
                  key={lead.id}
                  initial={{ opacity: 0, backgroundColor: 'rgba(35,131,226,0.12)' }}
                  animate={{
                    opacity: 1,
                    backgroundColor:
                      lead.featured
                        ? 'rgba(231,243,248,1)'
                        : 'rgba(0,0,0,0)',
                  }}
                  transition={{ duration: 1.2 }}
                  className={`border-t border-line hover:bg-hover ${
                    lead.featured
                      ? 'shadow-[inset_3px_0_0_0_var(--color-accent)]'
                      : ''
                  }`}
                >
                  <td className="px-4 py-3">
                    <Link
                      to={`/app/leads/${lead.id}`}
                      className="font-medium text-ink no-underline hover:text-accent"
                    >
                      {lead.company}
                      {lead.featured ? (
                        <span className="ml-2 rounded bg-accent-soft px-1.5 py-0.5 text-[0.68rem] font-medium text-accent">
                          Open this
                        </span>
                      ) : null}
                    </Link>
                    <p className="text-xs text-muted">
                      {lead.city}, {lead.country} · {lead.buyer}
                    </p>
                  </td>
                  <td className="px-4 py-3 text-muted">{lead.focus}</td>
                  <td className="px-4 py-3">
                    <StatusPill tone={tone[lead.status]}>
                      {statusLabel[lead.status]}
                    </StatusPill>
                  </td>
                  <td className="px-4 py-3 text-muted">{lead.worker}</td>
                  <td className="max-w-xs px-4 py-3 text-muted">{lead.lastAction}</td>
                </motion.tr>
              ))}
            </AnimatePresence>
          </tbody>
        </table>
      </div>
    </div>
  )
}
