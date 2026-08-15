import { useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import {
  AnimatePresence,
  motion,
  useReducedMotion,
  useScroll,
  useTransform,
} from 'framer-motion'
import { BobbyFace } from '../components/Bobby'
import { Logo } from '../components/Logo'

const EASE = [0.16, 1, 0.3, 1] as const
const VIEW = { once: true, margin: '-100px' } as const

const STATUS_ORDER = [
  'Sourcing',
  'Contacted',
  'Hotel trial',
  'Stain samples',
  'Negotiating',
  'Contract draft',
] as const

type LeadRow = {
  id: string
  name: string
  city: string
  status: string
}

const INITIAL_LEADS: LeadRow[] = [
  { id: 'nordlicht', name: 'Nordlicht Import', city: 'Hamburg', status: 'Negotiating' },
  { id: 'maas', name: 'Maas Interiors', city: 'Rotterdam', status: 'Contacted' },
  { id: 'oster', name: 'Oster Wohnen', city: 'Munich', status: 'Hotel trial' },
  { id: 'loire', name: 'Atelier Loire', city: 'Nantes', status: 'Stain samples' },
]

const TUESDAY_LOG = [
  {
    time: '09:02',
    tint: 'text-faint',
    text: 'Read hengxin-catalog.pdf. Six products, flagged the sofa fabrics.',
  },
  {
    time: '09:15',
    tint: 'text-faint',
    text: 'Matched 14 Hamburg importers from customs filings.',
  },
  {
    time: '10:03',
    tint: 'text-saffron',
    text: 'First letters out. Email for Anja, WhatsApp for Mads.',
  },
  {
    time: '11:40',
    tint: 'text-signal',
    text: 'Held the floor at €158/seat with Nordlicht. They stayed.',
  },
  {
    time: '14:12',
    tint: 'text-signal',
    text: 'Booked a factory inspection for week 41.',
  },
  {
    time: '16:20',
    tint: 'text-good',
    text: 'Sent the draft contract to a German lawyer for redlines.',
  },
] as const

const CAPABILITIES = [
  { icon: '/bobby/icon-read.png', label: 'Reads catalogs', to: '/onboarding/catalog' },
  { icon: '/bobby/icon-hunt.png', label: 'Hunts buyers', to: '/app/buyers' },
  { icon: '/bobby/icon-negotiate.png', label: 'Negotiates prices', to: '/app/leads/nordlicht' },
  { icon: '/bobby/icon-inspect.png', label: 'Books inspections', to: '/app/buyers' },
  { icon: '/bobby/icon-contract.png', label: 'Drafts contracts', to: '/app/leads/nordlicht/contract' },
] as const

const MINI_CATALOG_ROWS = [
  ['Lingnan Sofa 04', '岭南沙发', '€186 / seat'],
  ['Nanhai Table 12', '南海餐桌', '€214 / set'],
  ['Hotel Suite 22', '酒店套房', '€390 / room'],
  ['Canton Chair 19', '广府餐椅', '€41 / chair'],
] as const

const MINI_PIPELINE_ROWS = [
  ['Nordlicht Import', 'Negotiating', 'bg-stage-negotiating'],
  ['Oster Wohnen', 'Hotel trial', 'bg-stage-contacted'],
  ['Elbe Contract', 'Contract', 'bg-stage-contract'],
  ['Brabant Wonen', 'Sourcing', 'bg-stage-sourcing'],
] as const

function nextStatus(status: string): string {
  const index = STATUS_ORDER.indexOf(status as (typeof STATUS_ORDER)[number])
  if (index === -1 || index === STATUS_ORDER.length - 1) return STATUS_ORDER[0]
  return STATUS_ORDER[index + 1]
}

function statusPillClass(status: string): string {
  if (status === 'Negotiating') return 'bg-stage-negotiating/12 text-stage-negotiating'
  if (status === 'Contract draft') return 'bg-stage-contract/12 text-stage-contract'
  if (status === 'Contacted' || status === 'Hotel trial') {
    return 'bg-stage-contacted/12 text-stage-contacted'
  }
  return 'bg-stage-sourcing/12 text-stage-sourcing'
}

function Tap({ children }: { children: ReactNode }) {
  return (
    <motion.span className="inline-flex" whileTap={{ scale: 0.98 }}>
      {children}
    </motion.span>
  )
}

function CtaLink({
  to,
  children,
  variant,
}: {
  to: string
  children: ReactNode
  variant: 'primary' | 'ghost' | 'ink'
}) {
  const styles = {
    primary: 'bg-accent text-white hover:bg-accent/90',
    ghost: 'bg-accent-soft text-accent hover:bg-accent-soft/80',
    ink: 'bg-ink text-white hover:bg-ink/90',
  }[variant]

  return (
    <Link
      to={to}
      className={`inline-flex items-center justify-center rounded-lg px-4 py-1.5 text-sm font-medium no-underline transition-colors ${styles}`}
    >
      {children}
    </Link>
  )
}

const NOD_ITEMS = [
  'my team writes "Dear sir" two hundred times a day',
  'buyers reply at 3am Hamburg time',
  'a quote below cost slipped through last quarter',
  'our catalog lives in an 87-page PDF',
] as const

function UnlockChecklist({ reduceMotion }: { reduceMotion: boolean }) {
  const [checked, setChecked] = useState<boolean[]>(() => NOD_ITEMS.map(() => false))
  const count = checked.filter(Boolean).length
  const unlocked = count === NOD_ITEMS.length

  const toggle = (index: number) => {
    setChecked((prev) => prev.map((value, i) => (i === index ? !value : value)))
  }

  return (
    <div className="mx-auto max-w-xl text-left">
      <p className="text-center text-sm text-ink/60">nodding along? tick the boxes ↓</p>
      <div className="mt-5 space-y-2">
        {NOD_ITEMS.map((item, index) => (
          <motion.button
            key={item}
            type="button"
            onClick={() => toggle(index)}
            whileTap={reduceMotion ? undefined : { scale: 0.985 }}
            className={`flex w-full cursor-pointer items-center gap-3 rounded-lg border px-4 py-3 text-left text-sm transition-colors ${
              checked[index]
                ? 'border-ink/20 bg-bg text-ink'
                : 'border-ink/10 bg-white/45 text-ink/70 hover:bg-white/70'
            }`}
          >
            <span
              className={`flex h-5 w-5 shrink-0 items-center justify-center rounded border transition-colors ${
                checked[index] ? 'border-ink bg-ink text-white' : 'border-ink/30 bg-bg'
              }`}
              aria-hidden
            >
              {checked[index] ? (
                <svg width="11" height="11" viewBox="0 0 12 12" fill="none">
                  <path
                    d="M2.5 6.5 5 9l4.5-6"
                    stroke="currentColor"
                    strokeWidth="1.8"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              ) : null}
            </span>
            {item}
          </motion.button>
        ))}
      </div>

      <div className="mt-4 flex min-h-14 items-center justify-between gap-4">
        <p className="font-mono text-xs tabular-nums text-ink/55">
          {count}/{NOD_ITEMS.length} checked
        </p>
        <AnimatePresence mode="wait" initial={false}>
          {unlocked ? (
            <motion.div
              key="unlocked"
              initial={reduceMotion ? { opacity: 0 } : { opacity: 0, scale: 0.7, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9 }}
              transition={{ type: 'spring', stiffness: 320, damping: 20 }}
              className="flex items-center gap-3"
            >
              <BobbyFace expression="excited" size={36} />
              <Tap>
                <CtaLink to="/onboarding/catalog" variant="ink">
                  Bobby, take the desk
                </CtaLink>
              </Tap>
            </motion.div>
          ) : (
            <motion.p
              key="locked"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="text-xs italic text-ink/45"
            >
              something unlocks when all of it sounds like your factory
            </motion.p>
          )}
        </AnimatePresence>
      </div>
    </div>
  )
}

const WORKER_SCENES = [
  {
    id: 'w07',
    worker: 'Worker 07',
    company: 'Nordlicht Import · Hamburg',
    ask: 'Anja wants 2 × 40HQ in cream bouclé, German law.',
    action: 'Held €158/seat. Booked inspection, week 41. Drafting the contract now.',
    stage: 'Negotiating',
    bar: 'bg-stage-negotiating',
    from: 58,
    to: 78,
  },
  {
    id: 'w03',
    worker: 'Worker 03',
    company: 'Maas Interiors · Rotterdam',
    ask: 'Bram asked for an oak veneer sample before committing.',
    action: 'Sample ships Friday. Split-container quote already in his inbox.',
    stage: 'Contacted',
    bar: 'bg-stage-contacted',
    from: 26,
    to: 44,
  },
  {
    id: 'w09',
    worker: 'Worker 09',
    company: 'Oster Wohnen · Munich',
    ask: '40-room refurb needs Suite 22 pricing by Thursday.',
    action: 'Room pack sent. Follow-up scheduled, 09:00 their time.',
    stage: 'Hotel trial',
    bar: 'bg-stage-contacted',
    from: 40,
    to: 57,
  },
  {
    id: 'w01',
    worker: 'Worker 01',
    company: 'Elbe Contract · Dresden',
    ask: 'PO language sitting with their legal team.',
    action: 'Terac lawyer returned redlines. Waiting on countersign.',
    stage: 'Contract',
    bar: 'bg-stage-contract',
    from: 80,
    to: 93,
  },
] as const

function WorkerTheater({ reduceMotion }: { reduceMotion: boolean }) {
  const [active, setActive] = useState(0)
  const scene = WORKER_SCENES[active]

  useEffect(() => {
    if (reduceMotion) return
    const id = window.setInterval(() => {
      setActive((prev) => (prev + 1) % WORKER_SCENES.length)
    }, 3400)
    return () => window.clearInterval(id)
  }, [reduceMotion])

  return (
    <div className="rounded-lg bg-canvas p-4">
      <div className="rounded-lg border border-black/8 bg-bg p-3 shadow-[0_2px_8px_rgba(15,15,15,0.06)]">
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={scene.id}
            initial={reduceMotion ? { opacity: 1 } : { opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={reduceMotion ? { opacity: 1 } : { opacity: 0, y: -8 }}
            transition={{ duration: 0.3, ease: EASE }}
          >
            <div className="flex items-center justify-between">
              <p className="text-xs font-semibold text-ink">
                {scene.worker} <span className="font-normal text-muted">· {scene.company}</span>
              </p>
              <span className="flex items-center gap-1.5 text-[0.65rem] font-medium text-good">
                <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-good" />
                working
              </span>
            </div>
            <div className="mt-2 space-y-1.5 text-xs">
              <p className="rounded-md bg-sidebar px-2.5 py-1.5 text-ink/80">{scene.ask}</p>
              <p className="rounded-md border border-black/6 px-2.5 py-1.5 text-ink/80">
                {scene.action}
              </p>
            </div>
            <div className="mt-3 flex items-center gap-2">
              <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-black/8">
                <motion.div
                  key={`${scene.id}-bar`}
                  initial={{ width: `${scene.from}%` }}
                  animate={{ width: `${scene.to}%` }}
                  transition={{ duration: reduceMotion ? 0 : 2.9, ease: 'easeInOut' }}
                  className={`h-full rounded-full ${scene.bar}`}
                />
              </div>
              <span className="text-[0.65rem] text-faint">{scene.stage}</span>
            </div>
          </motion.div>
        </AnimatePresence>
      </div>

      <div className="mt-2.5 space-y-1">
        {WORKER_SCENES.map((row, index) => (
          <button
            key={row.id}
            type="button"
            onClick={() => setActive(index)}
            className={`flex w-full cursor-pointer items-center gap-2.5 rounded-md border-0 px-2.5 py-1.5 text-left text-[0.7rem] transition-colors ${
              index === active ? 'bg-bg text-ink' : 'bg-transparent text-muted hover:bg-bg/60'
            }`}
          >
            <span className="w-16 shrink-0 font-medium">{row.worker}</span>
            <span className="h-1 flex-1 overflow-hidden rounded-full bg-black/8">
              <span
                className={`block h-full rounded-full ${row.bar} ${
                  index === active && !reduceMotion ? 'animate-pulse' : ''
                }`}
                style={{ width: `${index === active ? row.to : row.from}%` }}
              />
            </span>
          </button>
        ))}
      </div>
    </div>
  )
}

function ArrowDot({ dark = true }: { dark?: boolean }) {
  return (
    <span
      className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full ${
        dark ? 'bg-ink text-white' : 'bg-white text-ink'
      }`}
      aria-hidden
    >
      <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
        <path
          d="M2 6h8M6.5 2.5 10 6l-3.5 3.5"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </span>
  )
}

function FeatureCard({
  eyebrow,
  title,
  to,
  children,
}: {
  eyebrow: string
  title: string
  to: string
  children: ReactNode
}) {
  return (
    <Link
      to={to}
      className="group block rounded-xl border border-black/8 bg-bg p-6 no-underline transition-shadow hover:shadow-[0_4px_12px_rgba(15,15,15,0.08)]"
    >
      <p className="text-xs text-muted">{eyebrow}</p>
      <div className="mt-1.5 flex items-start justify-between gap-4">
        <h3 className="text-lg font-semibold tracking-tight text-ink">{title}</h3>
        <ArrowDot />
      </div>
      <div className="mt-5 rounded-lg bg-canvas p-4">{children}</div>
    </Link>
  )
}

function MiniCatalogMock() {
  return (
    <div className="rounded-lg border border-black/8 bg-bg p-3 shadow-[0_2px_8px_rgba(15,15,15,0.06)]">
      <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold text-ink">
        <span aria-hidden>📄</span> hengxin-catalog-2026.pdf
      </p>
      {MINI_CATALOG_ROWS.map(([name, zh, price]) => (
        <div
          key={name}
          className="flex items-center justify-between border-t border-black/6 py-1.5 text-xs"
        >
          <span className="text-ink">
            {name} <span className="text-faint">{zh}</span>
          </span>
          <span className="text-muted">{price}</span>
        </div>
      ))}
    </div>
  )
}

function MiniPipelineMock() {
  return (
    <div className="rounded-lg border border-black/8 bg-bg p-3 shadow-[0_2px_8px_rgba(15,15,15,0.06)]">
      <p className="mb-2 text-xs font-semibold text-ink">Pipeline · 22 buyers</p>
      {MINI_PIPELINE_ROWS.map(([name, status, dot]) => (
        <div
          key={name}
          className="flex items-center justify-between border-t border-black/6 py-1.5 text-xs"
        >
          <span className="text-ink">{name}</span>
          <span className="flex items-center gap-1.5 text-muted">
            <span className={`h-1.5 w-1.5 rounded-full ${dot}`} />
            {status}
          </span>
        </div>
      ))}
    </div>
  )
}

function RedSquiggle({ className }: { className: string }) {
  return (
    <svg className={className} viewBox="0 0 72 28" fill="none" aria-hidden>
      <path
        d="M2 18c6-14 12 10 20 2 8-8 10-16 18-8 7 7 10-10 20-8 6 1 8 8 10 12"
        stroke="#e32d14"
        strokeWidth="2.2"
        strokeLinecap="round"
      />
    </svg>
  )
}

function LiveWorkspaceCard({ reduceMotion }: { reduceMotion: boolean }) {
  const [leads, setLeads] = useState(INITIAL_LEADS)

  useEffect(() => {
    if (reduceMotion) return
    let tick = 0
    const id = window.setInterval(() => {
      tick += 1
      setLeads((prev) => {
        const idx = tick % prev.length
        const updated = prev.map((row, i) =>
          i === idx ? { ...row, status: nextStatus(row.status) } : row,
        )
        if (tick % 2 === 1) {
          const picked = updated[idx]
          return [picked, ...updated.filter((_, i) => i !== idx)]
        }
        return updated
      })
    }, 2500)
    return () => window.clearInterval(id)
  }, [reduceMotion])

  return (
    <div className="rounded-xl border border-black/8 bg-bg p-4 shadow-[0_4px_12px_rgba(15,15,15,0.12)]">
      <div className="flex items-center px-2 py-2">
        <p className="text-sm font-medium text-ink">Bobby · discovering buyers</p>
      </div>
      <div className="space-y-2">
        <AnimatePresence initial={false} mode="popLayout">
          {leads.map((lead) => (
            <motion.div
              key={lead.id}
              layout={!reduceMotion}
              initial={reduceMotion ? false : { opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={reduceMotion ? undefined : { opacity: 0, y: -8 }}
              transition={{ duration: 0.35, ease: EASE }}
              className="flex items-center justify-between rounded-md bg-sidebar px-3 py-3"
            >
              <div>
                <p className="text-sm font-medium text-ink">{lead.name}</p>
                <p className="text-xs text-muted">{lead.city}</p>
              </div>
              <span className="relative min-w-[6.25rem] text-right">
                <AnimatePresence mode="wait" initial={false}>
                  <motion.span
                    key={lead.status}
                    initial={reduceMotion ? false : { opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={reduceMotion ? undefined : { opacity: 0, y: -6 }}
                    transition={{ duration: 0.22, ease: EASE }}
                    className={`inline-block rounded-full px-2 py-0.5 text-[0.68rem] font-medium ${statusPillClass(lead.status)}`}
                  >
                    {lead.status}
                  </motion.span>
                </AnimatePresence>
              </span>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </div>
  )
}

export function Landing() {
  const reduceMotion = Boolean(useReducedMotion())
  const { scrollYProgress } = useScroll()
  const scaleX = useTransform(scrollYProgress, [0, 1], [0, 1])
  const hidden = reduceMotion ? { opacity: 1, y: 0 } : { opacity: 0, y: 24 }
  const shown = { opacity: 1, y: 0 }

  return (
    <div className="min-h-svh bg-canvas">
      <motion.div
        aria-hidden
        className="fixed top-0 right-0 left-0 z-50 h-0.5 origin-left bg-accent"
        style={{ scaleX }}
      />

      <header className="sticky top-0 z-40 border-b border-black/8 bg-canvas/80 backdrop-blur-md">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-6">
          <Logo />
          <Tap>
            <CtaLink to="/app/buyers" variant="ghost">
              Open workspace
            </CtaLink>
          </Tap>
        </div>
      </header>

      <section className="mx-auto grid max-w-6xl items-center gap-12 px-6 py-20 md:grid-cols-2">
        <div>
          <motion.p
            initial={hidden}
            animate={shown}
            transition={{ duration: 0.6, ease: EASE }}
            className="text-xs font-medium uppercase tracking-widest text-muted"
          >
            For factories that export
          </motion.p>
          <motion.h1
            initial={hidden}
            animate={shown}
            transition={{ duration: 0.6, delay: 0.05, ease: EASE }}
            className="mt-4 text-5xl font-semibold leading-[1.08] tracking-[-0.028em] text-ink md:text-6xl"
          >
            Catalog in.
            <br />
            <span className="inline-block rounded-full bg-peach px-5 py-1">Contract</span>{' '}
            out.
          </motion.h1>
          <motion.p
            initial={hidden}
            animate={shown}
            transition={{ duration: 0.6, delay: 0.12, ease: EASE }}
            className="mt-6 font-serif text-xl italic text-graphite"
          >
            One agent, every buyer channel, zero inquiry desk.
          </motion.p>
          <motion.div
            initial={hidden}
            animate={shown}
            transition={{ duration: 0.6, delay: 0.18, ease: EASE }}
            className="mt-8 flex flex-wrap items-center gap-3"
          >
            <Tap>
              <CtaLink to="/onboarding/catalog" variant="primary">
                Start with your factory
              </CtaLink>
            </Tap>
            <Tap>
              <CtaLink to="/app/buyers" variant="ghost">
                Open workspace
              </CtaLink>
            </Tap>
          </motion.div>
        </div>

        <motion.div
          initial={hidden}
          animate={shown}
          transition={{ duration: 0.6, delay: 0.24, ease: EASE }}
          className="relative"
        >
          <RedSquiggle className="pointer-events-none absolute -top-5 -right-3 z-10 w-16 opacity-80 md:-right-5" />
          <div className="rounded-2xl bg-marigold p-6">
            <LiveWorkspaceCard reduceMotion={reduceMotion} />
          </div>
        </motion.div>
      </section>

      <section className="mx-auto max-w-6xl px-6 py-20">
        <motion.h2
          initial={hidden}
          whileInView={shown}
          viewport={VIEW}
          transition={{ duration: 0.6, ease: EASE }}
          className="text-4xl font-semibold tracking-[-0.02em] text-ink"
        >
          Bobby works where your buyers are.
        </motion.h2>

        <motion.div
          initial="hidden"
          whileInView="show"
          viewport={VIEW}
          variants={{ hidden: {}, show: { transition: { staggerChildren: 0.12 } } }}
          className="mt-8 grid gap-4 md:grid-cols-2"
        >
          <motion.div
            variants={{
              hidden,
              show: { ...shown, transition: { duration: 0.55, ease: EASE } },
            }}
          >
            <FeatureCard
              eyebrow="Read the catalog"
              title="Every SKU, straight out of the PDF."
              to="/onboarding/catalog"
            >
              <MiniCatalogMock />
            </FeatureCard>
          </motion.div>
          <motion.div
            variants={{
              hidden,
              show: { ...shown, transition: { duration: 0.55, ease: EASE } },
            }}
          >
            <FeatureCard
              eyebrow="Find buyers"
              title="22 conversations before lunch."
              to="/app/buyers"
            >
              <MiniPipelineMock />
            </FeatureCard>
          </motion.div>
        </motion.div>

        <motion.div
          initial={hidden}
          whileInView={shown}
          viewport={VIEW}
          transition={{ duration: 0.6, ease: EASE }}
          className="mt-4 rounded-xl border border-black/8 bg-bg p-6"
        >
          <p className="text-xs text-muted">Automate the busywork</p>
          <div className="mt-1.5 flex items-start justify-between gap-4">
            <h3 className="text-lg font-semibold tracking-tight text-ink">
              Keep deals moving 24/7 with workers.
            </h3>
            <ArrowDot />
          </div>
          <div className="mt-5 grid gap-4 md:grid-cols-[1fr_0.9fr]">
            <WorkerTheater reduceMotion={reduceMotion} />
            <div className="overflow-hidden rounded-lg">
              <img
                src="/bobby/bobby-desk.png"
                alt="Bobby working at his desk while a container ship passes"
                className="h-full w-full object-cover"
                loading="lazy"
              />
            </div>
          </div>
        </motion.div>
      </section>

      <section className="mx-auto max-w-6xl px-6 py-20">
        <motion.div
          initial={hidden}
          whileInView={shown}
          viewport={VIEW}
          transition={{ duration: 0.6, ease: EASE }}
          className="mb-6 flex items-center gap-3"
        >
          <BobbyFace expression="happy" size={44} />
          <h2 className="text-3xl font-semibold tracking-tight text-ink">
            A Tuesday, for Bobby.
          </h2>
        </motion.div>
        <motion.div
          initial="hidden"
          whileInView="show"
          viewport={VIEW}
          variants={{
            hidden: {},
            show: { transition: { staggerChildren: 0.1 } },
          }}
          className="overflow-hidden rounded-xl border border-black/8 bg-bg"
        >
          {TUESDAY_LOG.map((row, index) => (
            <motion.div
              key={row.time}
              variants={{
                hidden: hidden,
                show: { ...shown, transition: { duration: 0.55, ease: EASE } },
              }}
              className={`flex items-baseline gap-4 px-5 py-3.5 ${
                index < TUESDAY_LOG.length - 1 ? 'border-b border-black/8' : ''
              }`}
            >
              <span className={`shrink-0 font-mono text-xs tabular-nums ${row.tint}`}>
                {row.time}
              </span>
              <p className="text-sm leading-relaxed text-ink/80">{row.text}</p>
            </motion.div>
          ))}
        </motion.div>
      </section>

      <section className="mx-auto grid max-w-6xl items-stretch gap-3 px-6 py-20 md:grid-cols-2">
        <motion.div
          initial={reduceMotion ? shown : { opacity: 0, x: -28 }}
          whileInView={shown}
          viewport={VIEW}
          transition={{ duration: 0.65, ease: EASE }}
          className="overflow-hidden rounded-xl border border-black/8 bg-bg p-8"
        >
          <p className="text-xs font-semibold tracking-widest text-faint">
            BEFORE · THE INQUIRY DESK
          </p>

          <div className="mt-6 -rotate-1 rounded-lg border border-black/8 bg-bg shadow-[0_2px_8px_rgba(15,15,15,0.06)]">
            <div className="flex items-center gap-1.5 border-b border-black/6 px-3 py-2">
              <span className="h-2 w-2 rounded-full bg-black/10" />
              <span className="h-2 w-2 rounded-full bg-black/10" />
              <span className="ml-2 truncate text-xs font-medium text-ink">
                Re: Re: Fwd: Price inquiry??
              </span>
            </div>
            <div className="px-3 py-2.5">
              <p className="text-xs leading-relaxed text-ink/70">
                Dear sir, we are factory, best price good quality, pls kindly
                check attached 87-page catalog…
              </p>
              <p className="mt-1.5 text-[0.68rem] text-faint">
                Sent 03:12 · no reply · follow-up #7
              </p>
            </div>
          </div>

          <div className="mt-3 ml-6 flex rotate-[0.6deg] items-center gap-2.5 rounded-lg border border-black/8 bg-bg px-3 py-2.5 shadow-[0_2px_8px_rgba(15,15,15,0.06)]">
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-good text-[0.65rem] font-bold text-white">
              X
            </span>
            <div className="min-w-0">
              <p className="truncate text-xs font-medium text-ink">
                leads_final_v7_REAL.xlsx
              </p>
              <p className="text-[0.68rem] text-faint">
                edited 3 minutes ago · 6 people, 6 versions
              </p>
            </div>
          </div>

          <div className="mt-3 max-w-[85%] -rotate-[0.6deg]">
            <p className="mb-1 text-[0.68rem] text-faint">询盘部 · 小王 · 23:47</p>
            <p className="rounded-lg rounded-tl-sm bg-sidebar px-3 py-2 text-xs text-ink/80">
              他说的 FOB 是什么意思？在线等，急
            </p>
          </div>
        </motion.div>

        <motion.div
          initial={reduceMotion ? shown : { opacity: 0, x: 28 }}
          whileInView={shown}
          viewport={VIEW}
          transition={{ duration: 0.65, ease: EASE }}
          className="flex flex-col rounded-xl bg-coral p-8"
        >
          <p className="text-xs font-semibold tracking-widest text-white/75">
            AFTER · BOBBY
          </p>

          <div className="mt-6 rounded-lg bg-bg p-4 shadow-[0_4px_12px_rgba(15,15,15,0.15)]">
            <div className="flex items-center gap-2.5 border-b border-black/6 pb-3">
              <BobbyFace expression="happy" size={26} />
              <p className="text-sm font-semibold text-ink">Bobby · Export desk</p>
              <span className="ml-auto flex items-center gap-1.5 text-[0.68rem] font-medium text-good">
                <span className="h-1.5 w-1.5 rounded-full bg-good" />
                live
              </span>
            </div>
            <div className="space-y-2.5 pt-3 text-xs text-ink/80">
              <div className="flex items-center justify-between">
                <span>Conversations running</span>
                <span className="font-semibold text-ink">22</span>
              </div>
              <div className="flex items-center justify-between gap-3">
                <span>Channels</span>
                <span className="flex gap-1">
                  {['Email', 'WhatsApp', 'WeChat', 'LinkedIn'].map((channel) => (
                    <span
                      key={channel}
                      className="rounded-full bg-sidebar px-2 py-0.5 text-[0.65rem] text-ink/70"
                    >
                      {channel}
                    </span>
                  ))}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span>Floor price</span>
                <span className="font-medium text-good">held at €158/seat</span>
              </div>
            </div>
          </div>

          <p className="mt-auto pt-6 font-serif text-lg italic leading-snug text-white">
            Nothing reaches you until there's a contract to sign.
          </p>
        </motion.div>
      </section>

      <section className="mx-auto max-w-6xl px-6 pt-4 pb-2">
        <motion.p
          initial={hidden}
          whileInView={shown}
          viewport={VIEW}
          transition={{ duration: 0.5, ease: EASE }}
          className="mb-4 text-xs text-muted"
        >
          See what Bobby can do
        </motion.p>
        <motion.div
          initial="hidden"
          whileInView="show"
          viewport={VIEW}
          variants={{ hidden: {}, show: { transition: { staggerChildren: 0.07 } } }}
          className="grid grid-cols-2 gap-3 md:grid-cols-5"
        >
          {CAPABILITIES.map((cap) => (
            <motion.div
              key={cap.label}
              variants={{
                hidden,
                show: { ...shown, transition: { duration: 0.45, ease: EASE } },
              }}
            >
              <Link
                to={cap.to}
                className="group flex h-full flex-col items-start gap-3 rounded-xl border border-black/8 bg-bg p-4 no-underline transition-shadow hover:shadow-[0_4px_12px_rgba(15,15,15,0.08)]"
              >
                <img
                  src={cap.icon}
                  alt=""
                  className="h-12 w-12 rounded-full"
                  loading="lazy"
                />
                <span className="text-sm font-medium text-ink">
                  {cap.label}{' '}
                  <span className="inline-block transition-transform group-hover:translate-x-0.5">
                    →
                  </span>
                </span>
              </Link>
            </motion.div>
          ))}
        </motion.div>
      </section>

      <section className="mx-auto max-w-6xl px-6 py-20">
        <motion.div
          initial={hidden}
          whileInView={shown}
          viewport={VIEW}
          transition={{ duration: 0.65, ease: EASE }}
          className="rounded-2xl bg-sky-wash px-6 py-16"
        >
          <h2 className="text-center text-3xl font-semibold tracking-tight text-ink">
            Stop hiring inquiry desks.
          </h2>
          <div className="mt-8">
            <UnlockChecklist reduceMotion={reduceMotion} />
          </div>
        </motion.div>
      </section>
    </div>
  )
}
