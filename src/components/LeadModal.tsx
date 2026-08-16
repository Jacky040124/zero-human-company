import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { motion, useReducedMotion } from 'framer-motion'
import { leadStatusLabel } from '../data'
import type { Lead, LeadStatus } from '../data'
import type { ThreadMessage } from '../data/thread'
import { useDemo } from '../state/DemoContext'
import { LeadProgress } from './LeadProgress'

type ChannelId = 'email' | 'whatsapp' | 'linkedin' | 'wechat'

const CHANNELS: Array<{ id: ChannelId; label: string; available: boolean }> = [
  { id: 'email', label: 'Email', available: true },
  { id: 'whatsapp', label: 'WhatsApp', available: false },
  { id: 'linkedin', label: 'LinkedIn', available: false },
  { id: 'wechat', label: 'WeChat', available: false },
]

function buyerEmail(lead: Lead): string {
  if (lead.company.includes('Nordlicht')) return 'anja@nordlicht.de'
  const first = (lead.buyer.split(' ')[0] ?? 'buyer').toLowerCase().replace(/[^a-z]/g, '') || 'buyer'
  const host = lead.company.toLowerCase().replace(/[^a-z0-9]+/g, '').slice(0, 14) || 'buyer'
  return `${first}@${host}.com`
}

function emailSubject(lead: Lead): string {
  if (lead.company.includes('Nordlicht')) return 'FSC sofas from Foshan — 35-day lead'
  return `${lead.focus} from Hengxin Home`
}

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
  const reduceMotion = useReducedMotion()

  return (
    <span className="inline-flex items-center gap-0.5 py-1">
      {[0, 1, 2].map((index) => (
        <motion.span
          key={index}
          className="h-1 w-1 rounded-full bg-muted"
          animate={{ opacity: reduceMotion ? 0.65 : [0.25, 1, 0.25] }}
          transition={reduceMotion
            ? { duration: 0 }
            : { duration: 0.9, repeat: Infinity, delay: index * 0.16 }}
        />
      ))}
    </span>
  )
}

function EmailLetter({
  message,
  lead,
  subject,
}: {
  message: ThreadMessage
  lead: Lead
  subject: string
}) {
  const mine = message.role !== 'buyer'
  const peerName = message.toName ?? (lead.buyer === 'Research only' ? 'Procurement' : lead.buyer)
  const peerEmail = message.toEmail ?? buyerEmail(lead)
  const fromName = mine ? 'Lead Factory' : peerName
  const fromAddr = mine ? 'outbound@leadfactory.run' : peerEmail
  const toLine = mine
    ? `${peerName} <${peerEmail}>`
    : 'Lead Factory <outbound@leadfactory.run>'
  const initials = fromName.split(' ').filter(Boolean).slice(0, 2).map((part) => part[0]).join('')

  return (
    <article className="rounded-lg border border-black/8 bg-bg">
      <div className="flex items-start gap-2.5 border-b border-line px-3.5 py-2.5">
        <span className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[0.65rem] font-semibold ${
          mine ? 'bg-mocha text-bg' : 'bg-sky-wash text-white'
        }`}>
          {initials}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline justify-between gap-3">
            <p className="truncate text-sm text-ink">
              <span className="font-semibold">{fromName}</span>{' '}
              <span className="text-faint">&lt;{fromAddr}&gt;</span>
            </p>
            <time className="shrink-0 text-[0.62rem] text-faint">{message.time}</time>
          </div>
          <p className="truncate text-[0.68rem] text-muted">to {toLine}</p>
          <p className="mt-0.5 truncate text-[0.68rem] text-faint">Subject: {subject}</p>
        </div>
      </div>
      <div className="px-3.5 py-3">
        <p className="whitespace-pre-wrap text-sm leading-relaxed text-ink">
          {message.body.replace(/\[(?:your\s+)?name\]/gi, '').replace(/\n(?:best regards|kind regards|sincerely),?\s*$/i, '').trim()}
        </p>
      </div>
    </article>
  )
}

export function LeadModal({ lead, onClose }: LeadModalProps) {
  const {
    threads,
    leadAutonomy,
    setLeadAutonomy,
    sendLeadMessage,
    leadTyping,
    ensureLeadEmail,
  } = useDemo()
  const messages = threads[lead.id] ?? []
  const autonomous = leadAutonomy[lead.id] ?? true
  const typing = Boolean(leadTyping[lead.id])
  const [draft, setDraft] = useState('')
  const [channel, setChannel] = useState<ChannelId>('email')
  const [drafting, setDrafting] = useState(false)
  const first = messages[0]
  const subject = first?.subject ?? emailSubject(lead)
  const overlayRef = useRef<HTMLDivElement>(null)
  const dialogRef = useRef<HTMLDivElement>(null)
  const closeButtonRef = useRef<HTMLButtonElement>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const previouslyFocusedRef = useRef<HTMLElement | null>(null)
  const onCloseRef = useRef(onClose)
  onCloseRef.current = onClose

  useEffect(() => {
    const overlay = overlayRef.current
    const dialog = dialogRef.current
    if (!overlay || !dialog) return
    if (!previouslyFocusedRef.current && document.activeElement instanceof HTMLElement) {
      previouslyFocusedRef.current = document.activeElement
    }

    const inertedElements: Array<{
      element: HTMLElement
      hadInertAttribute: boolean
      inertAttributeValue: string | null
    }> = []
    let branch: HTMLElement = overlay
    let parent = branch.parentElement

    while (parent) {
      for (const sibling of Array.from(parent.children)) {
        if (sibling === branch || !(sibling instanceof HTMLElement)) continue
        inertedElements.push({
          element: sibling,
          hadInertAttribute: sibling.hasAttribute('inert'),
          inertAttributeValue: sibling.getAttribute('inert'),
        })
        sibling.inert = true
      }
      if (parent === document.body) break
      branch = parent
      parent = parent.parentElement
    }

    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'

    closeButtonRef.current?.focus()
    if (document.activeElement !== closeButtonRef.current) dialog.focus()

    const getFocusableElements = () => Array.from(dialog.querySelectorAll<HTMLElement>(
      'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"]), [contenteditable="true"]',
    )).filter((element) => !element.hasAttribute('hidden') && element.getClientRects().length > 0)

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        event.stopPropagation()
        onCloseRef.current()
        return
      }

      if (event.key !== 'Tab') return
      const focusableElements = getFocusableElements()
      if (focusableElements.length === 0) {
        event.preventDefault()
        dialog.focus()
        return
      }

      const first = focusableElements[0]
      const last = focusableElements[focusableElements.length - 1]
      const activeElement = document.activeElement
      if (!dialog.contains(activeElement)) {
        event.preventDefault()
        ;(event.shiftKey ? last : first).focus()
      } else if (event.shiftKey && activeElement === first) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && activeElement === last) {
        event.preventDefault()
        first.focus()
      }
    }

    document.addEventListener('keydown', onKeyDown, true)

    return () => {
      document.removeEventListener('keydown', onKeyDown, true)
      document.body.style.overflow = previousOverflow
      for (const { element, hadInertAttribute, inertAttributeValue } of inertedElements) {
        if (hadInertAttribute) {
          element.setAttribute('inert', inertAttributeValue ?? '')
        } else {
          element.removeAttribute('inert')
        }
      }
      const previouslyFocused = previouslyFocusedRef.current
      if (previouslyFocused?.isConnected) previouslyFocused.focus()
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

  useEffect(() => {
    let cancelled = false
    setDrafting(true)
    void ensureLeadEmail(lead).finally(() => {
      if (!cancelled) setDrafting(false)
    })
    return () => {
      cancelled = true
    }
  }, [ensureLeadEmail, lead.id])

  const handleSend = () => {
    const trimmed = draft.trim()
    if (!trimmed) return
    sendLeadMessage(lead.id, trimmed)
    setDraft('')
  }

  return (
    <div
      ref={overlayRef}
      className="fixed inset-0 z-50 flex items-center justify-center bg-[rgba(15,15,15,0.6)] p-4"
      onClick={onClose}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="lead-modal-title"
        tabIndex={-1}
        className={`flex max-h-[85vh] w-full max-w-3xl flex-col rounded-lg bg-bg ${overlayShadow}`}
        onClick={(event) => event.stopPropagation()}
      >
        <header className="shrink-0 border-b border-line px-5 py-4">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <h2 id="lead-modal-title" className="text-lg font-semibold text-ink">
                {lead.company}
              </h2>
              <p className="mt-0.5 text-sm text-muted">
                {first?.toName ?? (lead.buyer === 'Research only' ? 'Drafting contact…' : lead.buyer)}
                {lead.title === 'Research candidate' ? '' : `, ${lead.title}`}
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
                <p className={`text-xs font-medium ${
                  lead.runtimeStage === 'PAUSED' || lead.runtimeStage === 'LOST'
                    ? 'text-warn'
                    : statusText[lead.status]
                }`}>
                  {leadStatusLabel(lead)}
                </p>
                <p className="mt-0.5 text-[11px] text-faint">{lead.worker}</p>
              </div>
              <button
                ref={closeButtonRef}
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
          <div className="mt-4 flex flex-wrap gap-1.5" role="tablist" aria-label="Channels">
            {CHANNELS.map((item) => (
              <button
                key={item.id}
                type="button"
                role="tab"
                aria-selected={channel === item.id}
                disabled={!item.available}
                onClick={() => {
                  if (item.available) setChannel(item.id)
                }}
                className={`rounded-full border px-3 py-1 text-xs transition-colors ${
                  channel === item.id
                    ? 'border-ink bg-ink text-white'
                    : item.available
                      ? 'cursor-pointer border-black/10 bg-bg text-ink/70 hover:bg-hover'
                      : 'cursor-not-allowed border-black/8 bg-hover text-faint'
                }`}
              >
                {item.label}
                {item.available ? null : ' · soon'}
              </button>
            ))}
          </div>
        </header>

        <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto bg-canvas px-5 py-4">
          <div className="mb-3 flex items-center justify-between gap-3">
            <p className="truncate text-sm font-medium text-ink">{subject}</p>
            <span className="shrink-0 rounded-sm bg-hover px-1.5 py-0.5 text-[0.55rem] font-medium text-muted">
              Inbox
            </span>
          </div>
          <div className="space-y-3">
            {drafting && messages.length === 0 ? (
              <article className="rounded-lg border border-black/8 bg-bg px-3.5 py-3">
                <p className="text-sm text-ink">Drafting the first email…</p>
                <p className="mt-1 text-xs text-muted">gpt-4o-mini is writing a first touch for {lead.company}.</p>
                <TypingDots />
              </article>
            ) : null}
            {messages.map((message) => (
              <EmailLetter key={message.id} message={message} lead={lead} subject={message.subject ?? subject} />
            ))}
            {typing ? (
              <article className="rounded-lg border border-black/8 bg-bg px-3.5 py-3">
                <p className="text-[0.68rem] text-muted">{lead.buyer} is writing a reply…</p>
                <TypingDots />
              </article>
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
              <p className="text-xs text-muted">{lead.worker} is handling this inbox.</p>
            ) : (
              <p className="text-xs text-muted">Reply as email to {buyerEmail(lead)}</p>
            )}
          </div>

          {!autonomous ? (
            <div className="mt-3 rounded-lg border border-line bg-sidebar px-3 py-2.5">
              <p className="text-[0.68rem] text-muted">
                <span className="font-medium text-ink">Reply</span>
                {' · '}
                Re: {subject}
              </p>
              <div className="mt-2 flex items-end gap-2">
                <textarea
                  aria-label={`Email to ${lead.buyer}`}
                  value={draft}
                  rows={3}
                  onChange={(event) => setDraft(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
                      event.preventDefault()
                      handleSend()
                    }
                  }}
                  placeholder="Write the next email…"
                  className="min-h-[4.5rem] min-w-0 flex-1 resize-none rounded-md border border-line bg-bg px-3 py-2 text-sm text-ink outline-none placeholder:text-faint focus:border-accent"
                />
                <button
                  type="button"
                  onClick={handleSend}
                  className="cursor-pointer rounded-md border-0 bg-accent px-3.5 py-1.5 text-sm font-medium text-white hover:bg-accent/90"
                >
                  Send
                </button>
              </div>
            </div>
          ) : null}
        </footer>
      </div>
    </div>
  )
}
