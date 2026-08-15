import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import { statusLabel } from '../data'
import type { Lead, LeadStatus } from '../data'
import { useDemo } from '../state/DemoContext'
import { LeadProgress } from './LeadProgress'

const overlayShadow =
  'shadow-[rgba(15,15,15,0.05)_0_0_0_1px,rgba(15,15,15,0.1)_0_3px_6px,rgba(15,15,15,0.2)_0_9px_24px]'

const statusText: Record<LeadStatus, string> = {
  sourcing: 'text-stage-sourcing',
  contacted: 'text-stage-contacted',
  negotiating: 'text-stage-negotiating',
  contract: 'text-stage-contract',
}

type LeadModalProps = {
  lead: Lead
  onClose: () => void
}

function TypingDots() {
  return (
    <span className="inline-flex items-center gap-0.5 py-1">
      {[0, 1, 2].map((index) => (
        <motion.span
          key={index}
          className="h-1 w-1 rounded-full bg-muted"
          animate={{ opacity: [0.25, 1, 0.25] }}
          transition={{ duration: 0.9, repeat: Infinity, delay: index * 0.16 }}
        />
      ))}
    </span>
  )
}

export function LeadModal({ lead, onClose }: LeadModalProps) {
  const { threads, leadAutonomy, setLeadAutonomy, sendLeadMessage, leadTyping } = useDemo()
  const messages = threads[lead.id] ?? []
  const autonomous = leadAutonomy[lead.id] ?? true
  const typing = Boolean(leadTyping[lead.id])
  const [draft, setDraft] = useState('')
  const scrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  useEffect(() => {
    const previous = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = previous
    }
  }, [])

  useEffect(() => {
    const node = scrollRef.current
    if (!node) return
    node.scrollTop = node.scrollHeight
  }, [messages, typing])

  useEffect(() => {
    setDraft('')
  }, [lead.id])

  const handleSend = () => {
    const trimmed = draft.trim()
    if (!trimmed) return
    sendLeadMessage(lead.id, trimmed)
    setDraft('')
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-[rgba(15,15,15,0.6)] p-4"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="lead-modal-title"
        className={`flex max-h-[85vh] w-full max-w-2xl flex-col rounded-lg bg-bg ${overlayShadow}`}
        onClick={(event) => event.stopPropagation()}
      >
        <header className="shrink-0 border-b border-line px-5 py-4">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <h2 id="lead-modal-title" className="text-lg font-semibold text-ink">
                {lead.company}
              </h2>
              <p className="mt-0.5 text-sm text-muted">
                {lead.buyer}, {lead.title}
              </p>
              <p className="mt-0.5 text-xs text-faint">
                {lead.city}, {lead.country}
              </p>
              <p className="mt-1.5 text-xs text-muted">{lead.lastAction}</p>
              <Link
                to={`/app/leads/${lead.id}`}
                className="mt-2 inline-block text-[0.72rem] font-medium text-accent no-underline hover:underline"
              >
                Full thread →
              </Link>
            </div>
            <div className="flex shrink-0 items-center gap-3">
              <div className="text-right">
                <p className={`text-xs font-medium ${statusText[lead.status]}`}>
                  {statusLabel[lead.status]}
                </p>
                <p className="mt-0.5 text-[11px] text-faint">{lead.worker}</p>
              </div>
              <button
                type="button"
                aria-label="Close"
                onClick={onClose}
                className="flex h-7 w-7 cursor-pointer items-center justify-center rounded-md border-0 bg-transparent text-muted hover:bg-hover hover:text-ink"
              >
                ×
              </button>
            </div>
          </div>
          <div className="mt-4">
            <LeadProgress lead={lead} interactive={false} showLabels={false} />
          </div>
        </header>

        <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto bg-canvas px-5 py-4">
          <div className="space-y-3">
            {messages.map((message) => {
              const mine = message.role !== 'buyer'
              return (
                <div
                  key={message.id}
                  className={`flex flex-col ${mine ? 'items-end' : 'items-start'}`}
                >
                  <p
                    className={`mb-1 px-1 text-[0.62rem] text-faint ${
                      mine ? 'text-right' : ''
                    }`}
                  >
                    {message.from} · {message.time}
                  </p>
                  <div
                    className={`max-w-[82%] px-3 py-2 ${
                      mine
                        ? 'rounded-xl rounded-br-sm bg-accent-soft'
                        : 'rounded-xl rounded-bl-sm border border-black/6 bg-bg'
                    }`}
                  >
                    <p className="text-sm leading-relaxed text-ink">{message.body}</p>
                  </div>
                </div>
              )
            })}
            {typing ? (
              <div className="flex flex-col items-start">
                <p className="mb-1 px-1 text-[0.62rem] text-faint">{lead.buyer}</p>
                <div className="rounded-xl rounded-bl-sm border border-black/6 bg-bg px-3 py-2">
                  <TypingDots />
                </div>
              </div>
            ) : null}
          </div>
        </div>

        <footer className="shrink-0 border-t border-line px-5 py-3">
          <div className="flex items-center justify-between gap-3">
            <label className="flex cursor-pointer items-center gap-2 text-sm text-ink">
              <span>Autopilot</span>
              <button
                type="button"
                role="switch"
                aria-checked={autonomous}
                onClick={() => setLeadAutonomy(lead.id, !autonomous)}
                className={`relative h-5 w-9 cursor-pointer rounded-full border-0 transition-colors ${
                  autonomous ? 'bg-accent' : 'bg-line'
                }`}
              >
                <span
                  className={`absolute top-0.5 h-4 w-4 rounded-full bg-white transition-[left] ${
                    autonomous ? 'left-4' : 'left-0.5'
                  }`}
                />
              </button>
            </label>
            {autonomous ? (
              <p className="text-xs text-muted">{lead.worker} is handling this conversation.</p>
            ) : null}
          </div>

          {!autonomous ? (
            <div className="mt-3 flex items-center gap-2">
              <input
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    event.preventDefault()
                    handleSend()
                  }
                }}
                placeholder="Write as the factory…"
                className="min-w-0 flex-1 rounded-md border border-line bg-bg px-3 py-1.5 text-sm text-ink outline-none placeholder:text-faint focus:border-accent"
              />
              <button
                type="button"
                onClick={handleSend}
                className="cursor-pointer rounded-md border-0 bg-accent px-3.5 py-1.5 text-sm font-medium text-white hover:bg-accent/90"
              >
                Send
              </button>
            </div>
          ) : null}
        </footer>
      </div>
    </div>
  )
}
