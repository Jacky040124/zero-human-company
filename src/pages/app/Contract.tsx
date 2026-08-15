import { useEffect, useRef, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { motion } from 'framer-motion'
import {
  contractClauses,
  contractMeta,
  getLead,
  teracCall,
  teracLawyer,
  teracReview,
} from '../../data'
import { StatusPill } from '../../components/ui'

type Stage = 'draft' | 'calling' | 'matched' | 'reviewed'

export function Contract() {
  const { id } = useParams()
  const lead = getLead(id ?? 'nordlicht')
  const [stage, setStage] = useState<Stage>('draft')
  const timers = useRef<Array<ReturnType<typeof setTimeout>>>([])

  useEffect(() => {
    return () => timers.current.forEach(clearTimeout)
  }, [])

  const callTerac = () => {
    setStage('calling')
    timers.current.push(setTimeout(() => setStage('matched'), 1800))
    timers.current.push(setTimeout(() => setStage('reviewed'), 4200))
  }

  const reviewed = stage === 'reviewed'

  return (
    <div>
      <p className="text-sm text-muted">
        <Link to="/app/buyers" className="text-muted no-underline hover:text-ink">
          Buyers
        </Link>
        <span className="mx-2">/</span>
        <Link
          to={`/app/leads/${lead.id}`}
          className="text-muted no-underline hover:text-ink"
        >
          {lead.company}
        </Link>
        <span className="mx-2">/</span>
        Contract
      </p>

      <div className="mt-3 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight text-ink">
            Draft, then a lawyer.
          </h1>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted">
            Lead Factory wrote the supply agreement from the thread. Because the buyer is
            in {lead.country}, we can call Terac for a {lead.country} commercial
            lawyer. They do not draft. They redline.
          </p>
        </div>
        {reviewed ? (
          <StatusPill tone="good">{teracReview.status}</StatusPill>
        ) : (
          <StatusPill>{stage === 'draft' ? 'Draft ready' : 'Terac working…'}</StatusPill>
        )}
      </div>

      <div className="mt-8 grid gap-6 xl:grid-cols-[0.9fr_1.2fr]">
        <div className="space-y-4">
          <section className="rounded-lg border border-line bg-ink p-5 text-white">
            <p className="text-xs text-white/50">
              Terac · {teracCall.method} {teracCall.path}
            </p>
            <p className="mt-3 text-lg font-semibold leading-snug tracking-tight">
              {teracCall.task}
            </p>
            <p className="mt-4 text-xs text-white/55">
              skills: {teracCall.skills.join(', ')} · eta {teracCall.deadline}
            </p>
            {stage === 'draft' ? (
              <button
                type="button"
                onClick={callTerac}
                className="mt-5 cursor-pointer rounded-md border-0 bg-bg px-3.5 py-1.5 text-sm font-medium text-ink hover:bg-hover"
              >
                Call a {lead.country} lawyer on Terac
              </button>
            ) : (
              <p className="mt-5 text-sm text-white/70">
                {stage === 'calling'
                  ? 'Screening the panel: identity, bar, jurisdiction…'
                  : stage === 'matched'
                    ? `Matched ${teracLawyer.name}. Review in progress…`
                    : `Verified review returned in ${teracReview.elapsed}.`}
              </p>
            )}
          </section>

          {stage === 'matched' || reviewed ? (
            <motion.article
              initial={{ opacity: 0, y: 14 }}
              animate={{ opacity: 1, y: 0 }}
              className="rounded-lg border border-line bg-bg p-5"
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-xs text-muted">Matched expert</p>
                  <h2 className="mt-1 text-2xl font-semibold tracking-tight text-ink">
                    {teracLawyer.flag} {teracLawyer.name}
                  </h2>
                  <p className="text-sm text-muted">
                    {teracLawyer.title} · {teracLawyer.years} yrs · {teracLawyer.bar} bar
                  </p>
                </div>
                <p className="text-2xl font-semibold tracking-tight text-accent">
                  {teracLawyer.match}%
                </p>
              </div>
              <p className="mt-4 text-sm leading-relaxed text-ink">
                {teracLawyer.note}
              </p>
              <div className="mt-4 rounded-md border border-line bg-sidebar px-3 py-2.5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5">
                    {teracLawyer.attestations.map((item) => (
                      <span
                        key={item}
                        className="rounded bg-good-soft px-1.5 py-0.5 text-[0.7rem] font-medium text-good"
                        title={
                          {
                            ID: 'Government ID verified',
                            LI: 'LinkedIn verified',
                            EM: 'Work email verified',
                            IP: 'Location match verified',
                          }[item]
                        }
                      >
                        {item}
                      </span>
                    ))}
                    <span className="ml-1 text-[0.68rem] text-muted">
                      identity · profile · email · location
                    </span>
                  </div>
                  <span className="font-mono text-xs font-medium text-ink">
                    {teracLawyer.id}
                  </span>
                </div>
                <p className="mt-1.5 text-xs text-muted">
                  Verified human expert · {teracLawyer.rate} · paid on verified
                  completion
                </p>
              </div>
              {reviewed ? (
                <p className="mt-4 text-sm text-muted">{teracReview.summary}</p>
              ) : (
                <p className="mt-4 text-sm text-muted">Reading clauses 1 through 6…</p>
              )}
            </motion.article>
          ) : null}
        </div>

        <article className="rounded-lg border border-line bg-bg p-6 md:p-8">
          <p className="text-xs text-muted">{contractMeta.governingLaw}</p>
          <h2 className="mt-2 text-2xl font-semibold tracking-tight text-ink">
            {contractMeta.title}
          </h2>
          <p className="mt-2 text-sm text-muted">{contractMeta.parties}</p>
          <p className="mt-1 text-sm text-muted">
            {contractMeta.goods} · {contractMeta.value} · {contractMeta.incoterm}
          </p>
          <div className="mt-8 space-y-6">
            {contractClauses.map((clause) => (
              <section key={clause.id}>
                <h3 className="text-sm font-medium text-ink">{clause.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-ink">
                  {clause.body}
                </p>
                {reviewed && clause.flagged ? (
                  <motion.p
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="mt-2 rounded-md border-l-2 border-danger bg-danger-soft px-3 py-2 text-sm leading-relaxed text-danger"
                  >
                    <span className="font-semibold">Terac redline</span> ·{' '}
                    {clause.flagged}
                  </motion.p>
                ) : null}
              </section>
            ))}
          </div>
        </article>
      </div>
    </div>
  )
}
