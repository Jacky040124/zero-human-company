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
const EASE = [0.16, 1, 0.3, 1] as const
const VIEW = { once: true, margin: '-100px' } as const

const HERO_BOARD = [
  {
    title: 'Sourcing',
    dot: 'bg-stage-sourcing',
    cards: [
      ['Brabant Wonen', 'Eindhoven · customs filings match'],
      ['Göta Living', 'Gothenburg · first letter drafted'],
    ],
  },
  {
    title: 'Contacted',
    dot: 'bg-stage-contacted',
    cards: [
      ['Maas Interiors', 'Rotterdam · veneer sample ships Fri'],
      ['Oster Wohnen', 'Munich · Suite 22 room pack sent'],
      ['Atelier Loire', 'Nantes · waiting on fabric pick'],
    ],
  },
  {
    title: 'Negotiating',
    dot: 'bg-stage-negotiating',
    cards: [
      ['Nordlicht Import', 'Hamburg · holding €158/seat'],
      ['Havn Studio', 'Copenhagen · MOQ counter sent'],
    ],
  },
  {
    title: 'Contract',
    dot: 'bg-stage-contract',
    cards: [['Elbe Contract', 'Dresden · lawyer redlines back']],
  },
] as const

const HERO_STICKERS = [
  { icon: '/bobby/icon-read.png', className: '-top-5 left-4 md:-left-6', rotate: -8, delay: 0 },
  { icon: '/bobby/icon-hunt.png', className: '-top-7 right-16', rotate: 7, delay: 0.5 },
  { icon: '/bobby/icon-negotiate.png', className: 'top-1/3 -right-4 md:-right-7', rotate: 10, delay: 1 },
  { icon: '/bobby/icon-contract.png', className: '-bottom-4 right-6 md:-right-5', rotate: -6, delay: 1.5 },
  { icon: '/bobby/icon-inspect.png', className: 'bottom-8 -left-4 md:-left-7', rotate: 8, delay: 2 },
] as const

const HERO_PILLS = [
  { word: 'Contract', bg: 'bg-peach', dot: 'bg-saffron' },
  { word: 'Deal', bg: 'bg-accent-soft', dot: 'bg-accent' },
  { word: 'Signature', bg: 'bg-good-soft', dot: 'bg-good' },
  { word: 'Revenue', bg: 'bg-danger-soft', dot: 'bg-coral' },
] as const

function RotatingPill({ reduceMotion }: { reduceMotion: boolean }) {
  const [index, setIndex] = useState(0)

  useEffect(() => {
    if (reduceMotion) return
    const id = window.setInterval(() => {
      setIndex((prev) => (prev + 1) % HERO_PILLS.length)
    }, 2600)
    return () => window.clearInterval(id)
  }, [reduceMotion])

  const pill = HERO_PILLS[index]

  return (
    <span
      className={`inline-flex shrink-0 items-center gap-[0.28em] rounded-full px-[0.42em] py-[0.08em] transition-colors duration-500 ${pill.bg}`}
    >
      <span
        aria-hidden
        className={`inline-block h-[0.32em] w-[0.32em] shrink-0 rounded-full transition-colors duration-500 ${pill.dot}`}
      />
      <span className="relative inline-grid justify-items-center overflow-hidden">
        {/* Invisible copy of the longest word keeps the slot width fixed,
            so the headline never reflows as words rotate. */}
        <span aria-hidden className="invisible whitespace-nowrap [grid-area:1/1]">
          Signature
        </span>
        <AnimatePresence mode="popLayout" initial={false}>
          <motion.span
            key={pill.word}
            initial={reduceMotion ? false : { y: '105%', opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={reduceMotion ? undefined : { y: '-105%', opacity: 0 }}
            transition={{ duration: 0.4, ease: EASE }}
            className="whitespace-nowrap [grid-area:1/1]"
          >
            {pill.word}
          </motion.span>
        </AnimatePresence>
      </span>
    </span>
  )
}

const HERO_TABS = ['Dashboard', 'Buyers', 'Catalog', 'Contracts'] as const
type HeroTab = (typeof HERO_TABS)[number]

const HERO_WORKERS = ['Worker 01', 'Worker 03', 'Worker 07', 'Worker 09'] as const

const HERO_STATS = [
  ['Conversations', '22', 'across 4 channels'],
  ['Floor price', '€158', 'held with Nordlicht'],
  ['Inspections', '1', 'booked · week 41'],
  ['Contracts', '1', 'at lawyer redlines'],
] as const

const HERO_ACTIVITY = [
  ['10:44', 'Countered Nordlicht at €158/seat — they stayed'],
  ['10:12', 'Sent Suite 22 room pack to Oster Wohnen'],
  ['09:31', 'Found Brabant Wonen in customs filings'],
  ['09:02', 'Read hengxin-catalog-2026.pdf · 214 products'],
] as const

const HERO_CATALOG_ROWS = [
  ['Lingnan Sofa 04', '岭南沙发 04', '€186 / seat'],
  ['Nanhai Table 12', '南海餐桌 12', '€214 / set'],
  ['Hotel Suite 22', '酒店套房 22', '€390 / room'],
  ['Canton Chair 19', '广府餐椅 19', '€41 / chair'],
  ['Pearl Sideboard 08', '珠水边柜 08', '€143 / unit'],
] as const

const HERO_CONTRACTS = [
  ['Elbe Contract', 'Dresden', 'Lawyer redlines back · ready to countersign', 'bg-stage-contract'],
  ['Nordlicht Import', 'Hamburg', 'Drafting under German law · out tonight', 'bg-stage-negotiating'],
] as const

function HeroTabContent({ tab }: { tab: HeroTab }) {
  if (tab === 'Buyers') {
    return (
      <div className="grid grid-cols-2 gap-2.5 lg:grid-cols-4">
        {HERO_BOARD.map((column) => (
          <div key={column.title} className="rounded-lg bg-canvas p-2">
            <p className="flex items-center gap-1.5 px-1 pb-1.5 text-[0.68rem] font-medium text-muted">
              <span className={`h-1.5 w-1.5 rounded-full ${column.dot}`} />
              {column.title}
              <span className="ml-auto text-faint">{column.cards.length}</span>
            </p>
            <div className="space-y-1.5">
              {column.cards.map(([name, note]) => (
                <div
                  key={name}
                  className="cursor-default rounded-md border border-black/6 bg-bg px-2.5 py-2 shadow-[0_1px_3px_rgba(15,15,15,0.05)] transition-shadow hover:shadow-[0_3px_8px_rgba(15,15,15,0.1)]"
                >
                  <p className="truncate text-xs font-medium text-ink">{name}</p>
                  <p className="mt-0.5 truncate text-[0.65rem] text-faint">{note}</p>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    )
  }

  if (tab === 'Dashboard') {
    return (
      <div>
        <div className="grid grid-cols-2 gap-2.5 lg:grid-cols-4">
          {HERO_STATS.map(([label, value, hint]) => (
            <div key={label} className="rounded-lg bg-canvas px-3 py-2.5">
              <p className="text-[0.65rem] text-muted">{label}</p>
              <p className="mt-0.5 font-mono text-lg font-semibold tabular-nums text-ink">
                {value}
              </p>
              <p className="truncate text-[0.62rem] text-faint">{hint}</p>
            </div>
          ))}
        </div>
        <div className="mt-2.5 rounded-lg bg-canvas p-2">
          {HERO_ACTIVITY.map(([time, text]) => (
            <p
              key={time}
              className="flex items-baseline gap-2.5 rounded-md px-2 py-1.5 text-xs text-ink/80 hover:bg-bg"
            >
              <span className="shrink-0 font-mono text-[0.65rem] tabular-nums text-faint">
                {time}
              </span>
              <span className="truncate">{text}</span>
            </p>
          ))}
        </div>
      </div>
    )
  }

  if (tab === 'Catalog') {
    return (
      <div className="rounded-lg bg-canvas p-2">
        {HERO_CATALOG_ROWS.map(([name, zh, price]) => (
          <div
            key={name}
            className="flex items-center justify-between rounded-md px-2.5 py-2 text-xs hover:bg-bg"
          >
            <span className="truncate text-ink">
              {name} <span className="text-faint">{zh}</span>
            </span>
            <span className="shrink-0 text-muted">{price}</span>
          </div>
        ))}
        <p className="px-2.5 pt-1.5 pb-0.5 text-[0.65rem] text-faint">
          + 209 more from the PDF
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-2">
      {HERO_CONTRACTS.map(([name, city, note, dot]) => (
        <div
          key={name}
          className="flex items-center gap-3 rounded-lg bg-canvas px-3 py-2.5"
        >
          <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${dot}`} />
          <div className="min-w-0 flex-1">
            <p className="truncate text-xs font-medium text-ink">
              {name} <span className="font-normal text-faint">· {city}</span>
            </p>
            <p className="truncate text-[0.65rem] text-faint">{note}</p>
          </div>
          <span className="shrink-0 rounded-full bg-bg px-2 py-0.5 text-[0.62rem] text-muted">
            PDF
          </span>
        </div>
      ))}
      <p className="px-1 text-[0.65rem] italic text-faint">
        You'll only ever see this tab twice.
      </p>
    </div>
  )
}

const HERO_TAB_HEADERS: Record<HeroTab, string> = {
  Dashboard: "Tuesday · Bobby's desk",
  Buyers: 'Pipeline · 22 buyers',
  Catalog: 'Catalog · 214 products',
  Contracts: 'Contracts · 1 ready to sign',
}

function HeroWorkspaceMock() {
  const [tab, setTab] = useState<HeroTab>('Buyers')

  return (
    <div className="overflow-hidden rounded-2xl border border-black/10 bg-bg shadow-[0_24px_64px_rgba(15,15,15,0.16)]">
      <div className="flex items-center gap-1.5 border-b border-black/8 bg-sidebar px-4 py-2.5">
        <span className="h-2.5 w-2.5 rounded-full bg-black/12" />
        <span className="h-2.5 w-2.5 rounded-full bg-black/12" />
        <span className="h-2.5 w-2.5 rounded-full bg-black/12" />
        <span className="ml-3 flex items-center gap-1.5 rounded-md bg-bg px-2.5 py-1 text-[0.68rem] font-medium text-ink/75">
          <BobbyFace expression="happy" size={13} />
          Lead Factory — Hengxin Home
        </span>
      </div>

      <div className="flex">
        <aside className="hidden w-44 shrink-0 border-r border-black/8 bg-sidebar px-3 py-4 md:block">
          <div className="space-y-0.5">
            {HERO_TABS.map((label) => (
              <button
                key={label}
                type="button"
                onClick={() => setTab(label)}
                className={`block w-full cursor-pointer rounded-md border-0 px-2.5 py-1.5 text-left text-xs transition-colors ${
                  tab === label
                    ? 'bg-hover font-medium text-ink'
                    : 'bg-transparent text-muted hover:bg-hover/60 hover:text-ink'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
          <p className="mt-5 px-2.5 text-[0.62rem] font-semibold uppercase tracking-widest text-faint">
            Workers
          </p>
          <div className="mt-1.5 space-y-0.5">
            {HERO_WORKERS.map((worker) => (
              <p
                key={worker}
                className="flex items-center gap-2 rounded-md px-2.5 py-1 text-xs text-muted"
              >
                <span className="h-1.5 w-1.5 rounded-full bg-good" />
                {worker}
              </p>
            ))}
          </div>
        </aside>

        <div className="min-w-0 flex-1 p-4 text-left">
          <div className="flex items-center justify-between px-1 pb-3 md:hidden">
            <div className="flex gap-1">
              {HERO_TABS.map((label) => (
                <button
                  key={label}
                  type="button"
                  onClick={() => setTab(label)}
                  className={`cursor-pointer rounded-full border-0 px-2.5 py-1 text-[0.68rem] transition-colors ${
                    tab === label ? 'bg-ink text-white' : 'bg-canvas text-muted'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
          <div className="flex min-h-[16.5rem] flex-col">
            <div className="flex items-center justify-between px-1 pb-3">
              <AnimatePresence mode="wait" initial={false}>
                <motion.p
                  key={tab}
                  initial={{ opacity: 0, y: 4 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -4 }}
                  transition={{ duration: 0.15 }}
                  className="text-sm font-semibold text-ink"
                >
                  {HERO_TAB_HEADERS[tab]}
                </motion.p>
              </AnimatePresence>
              <span className="flex items-center gap-1.5 text-[0.68rem] font-medium text-good">
                <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-good" />
                Bobby is working
              </span>
            </div>
            <AnimatePresence mode="wait" initial={false}>
              <motion.div
                key={tab}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -6 }}
                transition={{ duration: 0.18, ease: EASE }}
              >
                <HeroTabContent tab={tab} />
              </motion.div>
            </AnimatePresence>
          </div>
        </div>
      </div>
    </div>
  )
}

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
  size = 'md',
}: {
  to: string
  children: ReactNode
  variant: 'primary' | 'ghost' | 'ink'
  size?: 'md' | 'lg'
}) {
  const styles = {
    primary: 'bg-accent text-white hover:bg-accent/90',
    ghost: 'bg-accent-soft text-accent hover:bg-accent-soft/80',
    ink: 'bg-ink text-white hover:bg-ink/90',
  }[variant]
  const sizing =
    size === 'lg' ? 'rounded-xl px-6 py-3 text-base' : 'rounded-lg px-4 py-1.5 text-sm'

  return (
    <Link
      to={to}
      className={`inline-flex items-center justify-center font-medium no-underline transition-colors ${sizing} ${styles}`}
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

const CONTRACT_ROWS = [
  { label: 'Parties', value: 'Hengxin Home ↔ Nordlicht Import GmbH' },
  { label: 'Order', value: '2 × 40HQ · Lingnan Sofa 04 · cream bouclé' },
  { label: 'Price', value: '€158 / seat — floor enforced, never below cost' },
  { label: 'Terms', value: 'Inspection week 41 · German law · counsel redlines' },
] as const

const UNLOCK_EXPRESSIONS = ['neutral', 'happy', 'happy', 'proud', 'excited'] as const

function UnlockChecklist({ reduceMotion }: { reduceMotion: boolean }) {
  const [checked, setChecked] = useState<boolean[]>(() => NOD_ITEMS.map(() => false))
  const count = checked.filter(Boolean).length
  const unlocked = count === NOD_ITEMS.length

  const toggle = (index: number) => {
    setChecked((prev) => prev.map((value, i) => (i === index ? !value : value)))
  }

  return (
    <div className="grid items-center gap-10 md:grid-cols-2">
      <div>
        <h2 className="text-3xl font-semibold tracking-tight text-ink">
          The whole sales team. Zero humans.
        </h2>
        <p className="mt-2 text-sm text-ink/60">
          nodding along? tick the boxes — the contract writes itself →
        </p>
        <div className="mt-6 space-y-2">
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
        <p className="mt-4 font-mono text-xs tabular-nums text-ink/55">
          {count}/{NOD_ITEMS.length} checked
        </p>
      </div>

      <motion.div
        animate={
          reduceMotion
            ? undefined
            : { rotate: unlocked ? 0 : -1, scale: unlocked ? 1.02 : 1 }
        }
        transition={{ type: 'spring', stiffness: 220, damping: 22 }}
        className="rounded-xl border border-black/8 bg-bg p-6 shadow-[0_12px_32px_rgba(15,15,15,0.16)]"
      >
        <div className="flex items-center justify-between border-b border-black/8 pb-3">
          <div>
            <p className="font-serif text-sm font-semibold tracking-wide text-ink">
              SUPPLY AGREEMENT
            </p>
            <p className="mt-0.5 text-[0.65rem] uppercase tracking-widest text-faint">
              {unlocked ? 'ready to sign' : `draft · ${count}/4 sections`}
            </p>
          </div>
          <BobbyFace expression={UNLOCK_EXPRESSIONS[count]} size={32} />
        </div>

        <div className="mt-4 space-y-3.5">
          {CONTRACT_ROWS.map((row, index) => {
            const revealed = index < count
            return (
              <div key={row.label} className="flex gap-3 text-sm">
                <span className="w-14 shrink-0 pt-0.5 text-[0.65rem] uppercase tracking-wide text-faint">
                  {row.label}
                </span>
                {revealed ? (
                  <motion.p
                    initial={reduceMotion ? false : { opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.3, ease: EASE }}
                    className="leading-snug text-ink/85"
                  >
                    {row.value}
                  </motion.p>
                ) : (
                  <div className="flex-1 space-y-1.5 pt-1.5" aria-hidden>
                    <div className="h-2 rounded-full bg-black/8" />
                    <div className="h-2 w-2/3 rounded-full bg-black/8" />
                  </div>
                )}
              </div>
            )
          })}
        </div>

        <div className="mt-5 flex min-h-16 items-center border-t border-dashed border-black/15 pt-4">
          <AnimatePresence mode="wait" initial={false}>
            {unlocked ? (
              <motion.div
                key="signed"
                initial={reduceMotion ? { opacity: 0 } : { opacity: 0, scale: 0.85, y: 8 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95 }}
                transition={{ type: 'spring', stiffness: 320, damping: 20 }}
                className="flex w-full flex-wrap items-center justify-between gap-4"
              >
                <div>
                  <p className="font-serif text-2xl italic leading-none text-ink">Bobby</p>
                  <p className="mt-1 text-[0.65rem] uppercase tracking-widest text-faint">
                    signed for Hengxin Home
                  </p>
                </div>
                <Tap>
                  <CtaLink to="/onboarding/catalog" variant="ink">
                    Bobby, take the desk
                  </CtaLink>
                </Tap>
              </motion.div>
            ) : (
              <motion.p
                key="waiting"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="text-xs italic text-faint"
              >
                signature appears when all of it sounds like your factory
              </motion.p>
            )}
          </AnimatePresence>
        </div>
      </motion.div>
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

      <section className="mx-auto max-w-6xl px-6 pt-14 pb-20">
        <div className="mx-auto flex max-w-3xl flex-col items-center text-center">
          <motion.img
            initial={hidden}
            animate={shown}
            transition={{ duration: 0.6, ease: EASE }}
            src="/bobby/crew.png"
            alt="Bobby and his crew of export workers"
            className="h-11 w-auto md:h-13"
          />
          <motion.p
            initial={hidden}
            animate={shown}
            transition={{ duration: 0.6, delay: 0.03, ease: EASE }}
            className="mt-7 text-xs font-medium uppercase tracking-[0.22em] text-muted"
          >
            A sales team with zero humans on it
          </motion.p>
          <motion.h1
            initial={hidden}
            animate={shown}
            transition={{ duration: 0.6, delay: 0.05, ease: EASE }}
            className="mt-4 flex w-max items-center justify-center gap-[0.22em] whitespace-nowrap text-[clamp(1.55rem,5.2vw,4.5rem)] font-semibold leading-none tracking-[-0.028em] text-ink"
          >
            <motion.span layout className="shrink-0">
              PDF in.
            </motion.span>
            <RotatingPill reduceMotion={reduceMotion} />
            <motion.span layout className="shrink-0">
              out.
            </motion.span>
          </motion.h1>
          <motion.p
            initial={hidden}
            animate={shown}
            transition={{ duration: 0.6, delay: 0.12, ease: EASE }}
            className="mt-6 font-serif text-xl italic text-graphite"
          >
            Meet Bobby — an AI agent that sells a factory's furniture across
            Europe. Finds buyers, negotiates, books lawyers. You only sign.
          </motion.p>
          <motion.div
            initial={hidden}
            animate={shown}
            transition={{ duration: 0.6, delay: 0.18, ease: EASE }}
            className="mt-8 flex flex-wrap items-center justify-center gap-3"
          >
            <Tap>
              <CtaLink to="/onboarding/catalog" variant="primary" size="lg">
                Watch Bobby work
              </CtaLink>
            </Tap>
            <Tap>
              <CtaLink to="/app/buyers" variant="ghost" size="lg">
                Open workspace
              </CtaLink>
            </Tap>
          </motion.div>
        </div>

        <motion.div
          initial={hidden}
          animate={shown}
          transition={{ duration: 0.7, delay: 0.26, ease: EASE }}
          className="relative mx-auto mt-14 max-w-5xl"
        >
          {HERO_STICKERS.map((sticker) => (
            <motion.img
              key={sticker.icon}
              src={sticker.icon}
              alt=""
              aria-hidden
              animate={reduceMotion ? undefined : { y: [0, -9, 0] }}
              transition={{
                duration: 3.6,
                repeat: Infinity,
                ease: 'easeInOut',
                delay: sticker.delay,
              }}
              className={`absolute z-10 h-11 w-11 rounded-full shadow-[0_4px_12px_rgba(15,15,15,0.18)] md:h-13 md:w-13 ${sticker.className}`}
              style={{ rotate: `${sticker.rotate}deg` }}
            />
          ))}
          <HeroWorkspaceMock />
        </motion.div>
      </section>

      <section className="border-y border-black/6 bg-bg">
        <div className="mx-auto max-w-6xl px-6 py-24">
        <motion.div
          initial={hidden}
          whileInView={shown}
          viewport={VIEW}
          transition={{ duration: 0.6, ease: EASE }}
        >
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-accent">
            What Bobby does
          </p>
          <h2 className="mt-3 text-4xl font-semibold tracking-[-0.02em] text-ink">
            Bobby works where your buyers are.
          </h2>
        </motion.div>

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
              eyebrow="Read the product PDF"
              title="Every product, priced and structured."
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
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-6 py-24">
        <motion.div
          initial={hidden}
          whileInView={shown}
          viewport={VIEW}
          transition={{ duration: 0.6, ease: EASE }}
          className="mb-10"
        >
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-accent">
            The difference
          </p>
          <h2 className="mt-3 text-4xl font-semibold tracking-[-0.02em] text-ink">
            Same Tuesday. Two very different desks.
          </h2>
        </motion.div>
        <div className="grid items-stretch gap-3 md:grid-cols-2">
        <motion.div
          initial={reduceMotion ? shown : { opacity: 0, x: -28 }}
          whileInView={shown}
          viewport={VIEW}
          transition={{ duration: 0.65, ease: EASE }}
          className="overflow-hidden rounded-xl border border-black/8 bg-bg p-8"
        >
          <p className="text-xs font-semibold tracking-widest text-faint">
            BEFORE · HUMANS DOING THIS
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
        </div>

        <motion.p
          initial={hidden}
          whileInView={shown}
          viewport={VIEW}
          transition={{ duration: 0.5, ease: EASE }}
          className="mt-14 mb-4 text-xs font-semibold uppercase tracking-[0.2em] text-accent"
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

      <section className="border-t border-black/6 bg-bg">
        <div className="mx-auto max-w-6xl px-6 py-24">
          <motion.div
            initial={hidden}
            whileInView={shown}
            viewport={VIEW}
            transition={{ duration: 0.65, ease: EASE }}
            className="rounded-2xl bg-sky-wash px-6 py-14 md:px-12"
          >
            <UnlockChecklist reduceMotion={reduceMotion} />
          </motion.div>
        </div>
      </section>

    </div>
  )
}
