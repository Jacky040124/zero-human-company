import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { getLead, nordlichtBrief, statusLabel } from '../../data'
import { ButtonLink, StatusPill } from '../../components/ui'
import { useDemo } from '../../state/DemoContext'

export function LeadDetail() {
  const { id } = useParams()
  const { leads, thread, sendMessage, buyerTyping, apiConnected } = useDemo()
  const lead = leads.find((item) => item.id === id) ?? getLead(id ?? 'nordlicht')
  const isFeatured = Boolean(lead.featured)
  const [draft, setDraft] = useState('')

  const messages = apiConnected
    ? [{ id: 'runtime', from: lead.worker, role: 'quay' as const, time: 'Live', body: lead.lastAction }]
    : isFeatured
    ? thread
    : [
        {
          id: 'x1',
          from: `Lead Factory · ${lead.worker}`,
          role: 'quay' as const,
          time: 'Today',
          body: `First letter sent to ${lead.buyer} about ${lead.focus}. Waiting on a reply.`,
        },
      ]

  const handleSend = () => {
    sendMessage(draft)
    setDraft('')
  }

  return (
    <div>
      <p className="text-sm text-muted">
        <Link to="/app/buyers" className="text-muted no-underline hover:text-ink">
          Buyers
        </Link>
        <span className="mx-2">/</span>
        {lead.company}
      </p>
      <div className="mt-3 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight text-ink">{lead.company}</h1>
          <p className="mt-1 text-sm text-muted">
            {lead.buyer}, {lead.title} · {lead.city}, {lead.country}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <StatusPill tone="live">{statusLabel[lead.status]}</StatusPill>
          <StatusPill>{lead.worker}</StatusPill>
        </div>
      </div>

      <div className="mt-8 grid gap-6 lg:grid-cols-[1.4fr_0.8fr]">
        <section className="rounded-lg border border-line bg-bg p-5">
          <p className="text-xs text-muted">Thread</p>
          <div className="mt-4 space-y-4">
            {messages.map((message) => (
              <article
                key={message.id}
                className={`rounded-md px-4 py-3 ${
                  message.role === 'buyer' ? 'bg-sidebar' : 'bg-hover'
                }`}
              >
                <div className="flex items-baseline justify-between gap-3">
                  <p className="text-sm font-medium text-ink">{message.from}</p>
                  <p className="text-xs text-muted">{message.time}</p>
                </div>
                <p className="mt-2 text-sm leading-relaxed text-ink">
                  {message.body}
                </p>
              </article>
            ))}
            {isFeatured && buyerTyping ? (
              <p className="px-1 text-sm text-muted">Anja Keller is typing…</p>
            ) : null}
          </div>

          {isFeatured && !apiConnected ? (
            <div className="mt-5 flex gap-2 border-t border-line pt-4">
              <input
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') handleSend()
                }}
                placeholder="Step in as the factory. Type a message…"
                className="min-w-0 flex-1 rounded-md border border-line bg-bg px-3.5 py-1.5 text-sm text-ink outline-none placeholder:text-muted focus:border-accent"
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
        </section>

        <aside className="space-y-4">
          <section className="rounded-lg border border-line bg-bg p-5">
            <p className="text-xs text-muted">This worker</p>
            <h2 className="mt-2 text-xl font-semibold tracking-tight text-ink">
              {isFeatured ? nordlichtBrief.goal : `Work ${lead.company} until they reply.`}
            </h2>
            <p className="mt-3 text-sm leading-relaxed text-muted">
              {isFeatured ? nordlichtBrief.next : lead.lastAction}
            </p>
            {isFeatured ? (
              <ul className="mt-4 space-y-2 text-sm text-ink">
                {nordlichtBrief.terms.map((term) => (
                  <li key={term}>{term}</li>
                ))}
              </ul>
            ) : null}
            {isFeatured ? (
              <div className="mt-6">
                <ButtonLink to={`/app/leads/${lead.id}/contract`}>
                  Draft contract
                </ButtonLink>
              </div>
            ) : (
              <p className="mt-6 text-sm text-muted">
                Open Nordlicht Import to see a finished negotiation.
              </p>
            )}
          </section>
        </aside>
      </div>
    </div>
  )
}
