import { useState } from 'react'
import { motion } from 'framer-motion'
import { statusLabel } from '../data'
import type { Lead, LeadStatus } from '../data'
import { useDemo } from '../state/DemoContext'

const STAGES: LeadStatus[] = ['sourcing', 'contacted', 'negotiating', 'contract']

const stageFill: Record<LeadStatus, string> = {
  sourcing: 'bg-stage-sourcing',
  contacted: 'bg-stage-contacted',
  negotiating: 'bg-stage-negotiating',
  contract: 'bg-stage-contract',
}

const overlayShadow =
  'shadow-[rgba(15,15,15,0.05)_0_0_0_1px,rgba(15,15,15,0.1)_0_3px_6px,rgba(15,15,15,0.2)_0_9px_24px]'

type LeadProgressProps = {
  lead: Lead
  onOpen?: (lead: Lead) => void
  interactive?: boolean
  showLabels?: boolean
}

export function LeadProgress({
  lead,
  onOpen,
  interactive = true,
  showLabels = true,
}: LeadProgressProps) {
  const { threads } = useDemo()
  const [hovered, setHovered] = useState(false)
  const currentIndex = STAGES.indexOf(lead.status)
  const recent = (threads[lead.id] ?? []).slice(-2)

  return (
    <div
      className={`relative ${hovered ? 'z-30' : ''} ${interactive ? 'cursor-pointer' : ''}`}
      onMouseEnter={() => {
        if (interactive) setHovered(true)
      }}
      onMouseLeave={() => setHovered(false)}
      onClick={() => {
        if (interactive) onOpen?.(lead)
      }}
      onKeyDown={(event) => {
        if (!interactive) return
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault()
          onOpen?.(lead)
        }
      }}
      role={interactive ? 'button' : undefined}
      tabIndex={interactive ? 0 : undefined}
    >
      <div className="flex h-2 gap-0.5">
        {STAGES.map((stage, index) => {
          const complete = index < currentIndex
          const current = index === currentIndex
          return (
            <div
              key={stage}
              className={`relative min-w-0 flex-1 overflow-hidden bg-line ${
                index === 0 ? 'rounded-l-md' : index === STAGES.length - 1 ? 'rounded-r-md' : 'rounded-sm'
              }`}
            >
              {complete ? <div className={`absolute inset-0 ${stageFill[stage]}`} /> : null}
              {current ? (
                <motion.div
                  className={`absolute inset-y-0 left-0 w-[60%] overflow-hidden ${stageFill[stage]}`}
                  animate={{ opacity: [0.72, 1, 0.72] }}
                  transition={{ duration: 1.8, repeat: Infinity, ease: 'easeInOut' }}
                >
                  <motion.div
                    className="absolute inset-y-0 w-1/3 bg-white/35"
                    animate={{ x: ['-120%', '320%'] }}
                    transition={{ duration: 1.8, repeat: Infinity, ease: 'linear' }}
                  />
                </motion.div>
              ) : null}
            </div>
          )
        })}
      </div>

      {showLabels ? (
        <div className="mt-1.5 flex gap-0.5">
          {STAGES.map((stage) => (
            <span key={stage} className="min-w-0 flex-1 truncate text-[11px] text-faint">
              {statusLabel[stage]}
            </span>
          ))}
        </div>
      ) : null}

      {interactive && hovered ? (
        <div
          className={`absolute left-0 top-full z-30 mt-2 w-[340px] max-w-[calc(100vw-48px)] rounded-lg border border-line bg-bg p-3 ${overlayShadow}`}
        >
          <p className="text-sm font-medium text-ink">{lead.buyer}</p>
          <p className="text-xs text-muted">{lead.company}</p>
          <p className="mt-2 text-[11px] text-faint">{lead.worker}</p>
          <div className="mt-2 space-y-1.5">
            {recent.length === 0 ? (
              <p className="text-xs text-faint">No messages yet</p>
            ) : (
              recent.map((message) => (
                <p key={message.id} className="line-clamp-2 text-xs leading-relaxed text-ink">
                  <span className="text-faint">
                    {message.role === 'quay' ? 'Lead Factory' : lead.buyer}:{' '}
                  </span>
                  {message.body}
                </p>
              ))
            )}
          </div>
          <p className="mt-2 text-[11px] text-muted">{lead.lastAction}</p>
        </div>
      ) : null}
    </div>
  )
}
