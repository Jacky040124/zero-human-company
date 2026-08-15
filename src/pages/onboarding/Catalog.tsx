import { useEffect, useMemo, useRef, useState } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import { catalog } from '../../data'
import type { Product } from '../../data'
import type { BobbyExpression } from '../../components/Bobby'
import { OnboardingLayout } from './OnboardingLayout'

type Phase = 'upload' | 'extracting' | 'done'

type CatalogFile = {
  name: string
  sizeLabel: string
}

type CatalogItem = {
  id: string
  name: string
  nameZh: string
  category: string
  priceLabel: string
  image: string
  flagged: boolean
}

const SAMPLE_FILE: CatalogFile = {
  name: 'hengxin-catalog-2026.pdf',
  sizeLabel: '2.4 MB',
}

const EXTRACT_DURATION_MS = 7800

/* Variants per base product — sums to 214, the "hundreds of SKUs" a real
   factory catalog carries. Derived from the 6 seed products so the demo
   needs no extra data. */
const VARIANTS_PER_BASE = [38, 42, 31, 24, 46, 33]

function baseNameParts(name: string): string {
  return name.replace(/\s*\d+$/, '')
}

function buildFullCatalog(): CatalogItem[] {
  const items: CatalogItem[] = []
  catalog.forEach((base: Product, baseIndex: number) => {
    const count = VARIANTS_PER_BASE[baseIndex] ?? 20
    const stem = baseNameParts(base.name)
    const stemZh = baseNameParts(base.nameZh)
    for (let i = 0; i < count; i += 1) {
      const num = String(i + 1).padStart(2, '0')
      const price = Math.round(base.list * (0.85 + ((i * 7) % 10) * 0.06))
      items.push({
        id: `${base.id}-v${num}`,
        name: `${stem} ${num}`,
        nameZh: `${stemZh} ${num}`,
        category: base.category,
        priceLabel: `€${price} / ${base.unit}`,
        image: base.image,
        flagged: false,
      })
    }
  })
  // Interleave categories so extraction feels like reading a real PDF,
  // then flag ~1 in 17 for review.
  const shuffled: CatalogItem[] = []
  const buckets = catalog.map((base) =>
    items.filter((item) => item.id.startsWith(base.id)),
  )
  let remaining = items.length
  let cursor = 0
  while (remaining > 0) {
    const bucket = buckets[cursor % buckets.length]
    const next = bucket.shift()
    if (next) {
      shuffled.push(next)
      remaining -= 1
    }
    cursor += 1
  }
  return shuffled.map((item, index) =>
    index % 17 === 5 ? { ...item, flagged: true } : item,
  )
}

const FULL_CATALOG = buildFullCatalog()
const TOTAL = FULL_CATALOG.length
const CATEGORIES = [...new Set(FULL_CATALOG.map((item) => item.category))]
const FLAGGED_COUNT = FULL_CATALOG.filter((item) => item.flagged).length
const INITIAL_VISIBLE = 48

/* The counter rushes through all 214, but only a sampled handful get the
   full "pop out of the scan → compress into the list" performance.
   Step 23 is coprime with the 6-category interleave, so heroes rotate
   across categories (and therefore across product images). */
const HERO_COUNT = 9
const HERO_ITEMS = Array.from(
  { length: HERO_COUNT },
  (_, i) => FULL_CATALOG[(i * 23 + 5) % TOTAL],
)
const HERO_FIRST_DELAY_MS = 500
const HERO_INTERVAL_MS = 760
const HERO_HOLD_MS = 500

type HeroStage = 'flying' | 'listed'
type HeroState = { item: CatalogItem; stage: HeroStage }

const PDF_BLOCKS: Array<{ kind: 'lines' | 'image'; color?: string }> = [
  { kind: 'lines' },
  { kind: 'image', color: 'bg-marigold' },
  { kind: 'lines' },
  { kind: 'image', color: 'bg-sky-wash' },
  { kind: 'lines' },
  { kind: 'image', color: 'bg-coral' },
  { kind: 'lines' },
  { kind: 'image', color: 'bg-good' },
  { kind: 'lines' },
  { kind: 'image', color: 'bg-peach' },
  { kind: 'lines' },
  { kind: 'image', color: 'bg-saffron' },
]

function formatSize(bytes: number) {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function easeOutCubic(t: number) {
  return 1 - Math.pow(1 - t, 3)
}

function FurniturePlaceholder() {
  return (
    <svg viewBox="0 0 160 120" className="h-full w-full text-faint" aria-hidden>
      <rect x="18" y="48" width="124" height="36" rx="4" fill="none" stroke="currentColor" strokeWidth="1.5" />
      <path d="M28 48v-8a8 8 0 0 1 8-8h88a8 8 0 0 1 8 8v8" fill="none" stroke="currentColor" strokeWidth="1.5" />
      <path d="M30 84v12M130 84v12M18 70h124" fill="none" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  )
}

function ProductThumb({ src, alt }: { src: string; alt: string }) {
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading')

  return (
    <div className="relative aspect-[4/3] overflow-hidden bg-sidebar">
      {status === 'error' ? (
        <FurniturePlaceholder />
      ) : (
        <img
          src={src}
          alt={alt}
          loading="lazy"
          className={`h-full w-full object-cover transition-opacity duration-300 ${
            status === 'ready' ? 'opacity-100' : 'opacity-0'
          }`}
          onLoad={() => setStatus('ready')}
          onError={() => setStatus('error')}
        />
      )}
    </div>
  )
}

function PdfPage({ file }: { file: CatalogFile }) {
  return (
    <div className="relative h-[26rem] w-[16rem] overflow-hidden rounded-xl border border-black/8 bg-bg shadow-[0_4px_12px_rgba(15,15,15,0.1)]">
      <div className="flex items-center gap-2 border-b border-line px-3 py-2">
        <span className="h-2 w-2 rounded-sm bg-danger" />
        <p className="truncate text-[0.7rem] text-muted">{file.name}</p>
      </div>
      <div className="relative h-[calc(100%-2.25rem)] overflow-hidden">
        <motion.div
          className="px-3 py-3"
          animate={{ y: ['0%', '-50%'] }}
          transition={{ duration: 10, repeat: Infinity, ease: 'linear' }}
        >
          {[0, 1].map((copy) => (
            <div key={copy} className="space-y-3">
              {PDF_BLOCKS.map((block, index) =>
                block.kind === 'image' ? (
                  <div
                    key={`${copy}-${index}`}
                    className={`h-16 rounded-md ${block.color ?? 'bg-hover'}`}
                  />
                ) : (
                  <div key={`${copy}-${index}`} className="space-y-1.5">
                    <div className="h-1.5 w-5/6 rounded-full bg-line" />
                    <div className="h-1.5 w-2/3 rounded-full bg-line" />
                    <div className="h-1.5 w-3/4 rounded-full bg-line" />
                  </div>
                ),
              )}
            </div>
          ))}
        </motion.div>
        <motion.div
          className="pointer-events-none absolute left-0 right-0 h-10"
          style={{
            background:
              'linear-gradient(to bottom, transparent, rgba(0,117,222,0.22), transparent)',
            borderTop: '1px solid rgba(0,117,222,0.4)',
            borderBottom: '1px solid rgba(0,117,222,0.4)',
          }}
          animate={{ top: ['4%', '82%'] }}
          transition={{ duration: 2.1, repeat: Infinity, repeatType: 'reverse', ease: 'easeInOut' }}
        />
      </div>
    </div>
  )
}

/* Card that pops out of the scan line on the PDF. It shares a layoutId with
   its future list row, so when the hero flips to 'listed' Framer Motion
   FLIP-morphs this card across the screen and compresses it into the row. */
function FlyingCard({ item }: { item: CatalogItem }) {
  return (
    <motion.div
      layoutId={`hero-${item.id}`}
      initial={{ opacity: 0, scale: 0.4, rotate: -6 }}
      animate={{ opacity: 1, scale: 1, rotate: 3 }}
      transition={{ type: 'spring', stiffness: 340, damping: 24 }}
      className="absolute top-[30%] left-[52%] z-10 w-40 overflow-hidden rounded-lg border border-black/8 bg-bg shadow-[0_10px_28px_rgba(15,15,15,0.22)]"
    >
      <motion.div layout className="aspect-[4/3] overflow-hidden bg-sidebar">
        <img src={item.image} alt="" className="h-full w-full object-cover" />
      </motion.div>
      <motion.div layout="position" className="p-2">
        <p className="truncate text-xs font-medium text-ink">{item.name}</p>
        <p className="truncate text-[0.68rem] text-muted">{item.priceLabel}</p>
      </motion.div>
    </motion.div>
  )
}

function ExtractedRow({
  item,
  animateLayout,
}: {
  item: CatalogItem
  animateLayout: boolean
}) {
  return (
    <motion.div
      layoutId={animateLayout ? `hero-${item.id}` : undefined}
      layout={animateLayout}
      initial={{ opacity: 0, y: -10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ type: 'spring', stiffness: 320, damping: 30 }}
      className="flex items-center gap-2.5 overflow-hidden rounded-md bg-sidebar px-2 py-1.5"
    >
      <motion.div
        layout={animateLayout}
        className="h-8 w-8 shrink-0 overflow-hidden rounded bg-hover"
      >
        <img src={item.image} alt="" className="h-full w-full object-cover" />
      </motion.div>
      <motion.p
        layout={animateLayout ? 'position' : undefined}
        className="min-w-0 flex-1 truncate text-xs text-ink"
      >
        {item.name} <span className="text-faint">{item.nameZh}</span>
      </motion.p>
      <motion.span
        layout={animateLayout ? 'position' : undefined}
        className="shrink-0 text-[0.68rem] text-muted"
      >
        {item.priceLabel}
      </motion.span>
    </motion.div>
  )
}

function ExtractionPanel({
  count,
  rows,
  animateLayout,
}: {
  count: number
  rows: CatalogItem[]
  animateLayout: boolean
}) {
  const progress = Math.min(1, count / TOTAL)

  return (
    <div className="min-w-0 flex-1 rounded-xl border border-black/8 bg-bg p-6 shadow-[0_4px_12px_rgba(15,15,15,0.08)]">
      <div className="flex items-baseline gap-3">
        <p className="font-mono text-5xl font-semibold tabular-nums tracking-tight text-ink">
          {count}
        </p>
        <p className="text-sm text-muted">of {TOTAL} products extracted</p>
      </div>

      <div className="mt-4 h-1.5 overflow-hidden rounded-full bg-black/8">
        <motion.div
          className="h-full rounded-full bg-accent"
          animate={{ width: `${progress * 100}%` }}
          transition={{ duration: 0.2, ease: 'linear' }}
        />
      </div>

      <p className="mt-6 text-[0.65rem] font-semibold uppercase tracking-widest text-faint">
        Just extracted
      </p>
      <div className="mt-2.5 min-h-[19rem] space-y-1.5">
        {rows.map((item) => (
          <ExtractedRow key={item.id} item={item} animateLayout={animateLayout} />
        ))}
      </div>

      <p className="mt-5 text-[0.68rem] italic text-faint">
        click anywhere to skip the show
      </p>
    </div>
  )
}

type Filter = 'All' | 'Flagged' | (string & {})

function CatalogBrowser() {
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState<Filter>('All')
  const [showAll, setShowAll] = useState(false)

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return FULL_CATALOG.filter((item) => {
      if (filter === 'Flagged' && !item.flagged) return false
      if (filter !== 'All' && filter !== 'Flagged' && item.category !== filter) {
        return false
      }
      if (!q) return true
      return (
        item.name.toLowerCase().includes(q) ||
        item.nameZh.includes(q) ||
        item.category.toLowerCase().includes(q)
      )
    })
  }, [query, filter])

  const visible = showAll ? filtered : filtered.slice(0, INITIAL_VISIBLE)

  return (
    <div>
      <div className="flex flex-wrap items-center gap-x-6 gap-y-2 rounded-xl border border-black/8 bg-bg px-5 py-4">
        <p className="text-sm text-ink">
          <span className="font-semibold">{TOTAL} products</span>
          <span className="text-muted"> · {CATEGORIES.length} categories</span>
        </p>
        <p className="text-sm text-warn">
          ⚠ {FLAGGED_COUNT} flagged for review
        </p>
        <p className="ml-auto text-xs text-muted">
          Bobby read every page so you don't have to
        </p>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <input
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder={`Search ${TOTAL} products…`}
          className="w-56 rounded-lg border border-black/10 bg-bg px-3 py-1.5 text-sm text-ink placeholder:text-faint focus:border-accent focus:outline-none"
        />
        {(['All', ...CATEGORIES, 'Flagged'] as Filter[]).map((option) => (
          <button
            key={option}
            type="button"
            onClick={() => {
              setFilter(option)
              setShowAll(false)
            }}
            className={`cursor-pointer rounded-full border px-3 py-1 text-xs transition-colors ${
              filter === option
                ? 'border-ink bg-ink text-white'
                : option === 'Flagged'
                  ? 'border-warn/40 bg-warn-soft text-warn hover:border-warn'
                  : 'border-black/10 bg-bg text-ink/70 hover:bg-hover'
            }`}
          >
            {option === 'Flagged' ? `⚠ Flagged (${FLAGGED_COUNT})` : option}
          </button>
        ))}
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
        {visible.map((item) => (
          <article
            key={item.id}
            className="overflow-hidden rounded-lg border border-black/8 bg-bg transition-shadow hover:shadow-[0_4px_12px_rgba(15,15,15,0.08)]"
          >
            <ProductThumb src={item.image} alt={item.name} />
            <div className="p-2.5">
              <p className="truncate text-xs font-medium text-ink">{item.name}</p>
              <p className="truncate text-[0.68rem] text-faint">{item.nameZh}</p>
              <div className="mt-1.5 flex items-center justify-between gap-2">
                <p className="text-xs text-ink/80">{item.priceLabel}</p>
                {item.flagged && (
                  <span className="shrink-0 rounded bg-warn-soft px-1 py-0.5 text-[0.6rem] font-medium text-warn">
                    ⚠ review
                  </span>
                )}
              </div>
            </div>
          </article>
        ))}
      </div>

      {filtered.length === 0 && (
        <p className="py-12 text-center text-sm text-muted">
          Nothing matches — try another name or category.
        </p>
      )}

      {!showAll && filtered.length > INITIAL_VISIBLE && (
        <div className="mt-5 flex justify-center">
          <button
            type="button"
            onClick={() => setShowAll(true)}
            className="cursor-pointer rounded-lg border border-black/10 bg-bg px-4 py-2 text-sm text-ink transition-colors hover:bg-hover"
          >
            Show all {filtered.length} products
          </button>
        </div>
      )}
    </div>
  )
}

function extractionVoice(count: number): { expression: BobbyExpression; line: string } {
  if (count < TOTAL * 0.2) {
    return { expression: 'reading', line: 'Page 12… the oak tables look strong 👀' }
  }
  if (count < TOTAL * 0.8) {
    return { expression: 'excited', line: `${count} down, still reading… 🔍` }
  }
  return { expression: 'excited', line: 'Almost through the appendix…' }
}

export function Catalog() {
  const [phase, setPhase] = useState<Phase>('upload')
  const [file, setFile] = useState<CatalogFile | null>(null)
  const [dragging, setDragging] = useState(false)
  const [extractedCount, setExtractedCount] = useState(0)
  const [heroes, setHeroes] = useState<HeroState[]>([])
  const reduceMotion = Boolean(useReducedMotion())
  const inputRef = useRef<HTMLInputElement>(null)
  const rafRef = useRef<number>(0)

  const finishDone = () => {
    cancelAnimationFrame(rafRef.current)
    setExtractedCount(TOTAL)
    setPhase('done')
  }

  const startWithFile = (next: CatalogFile) => {
    setFile(next)
    setExtractedCount(0)
    setHeroes([])
    setPhase('extracting')
  }

  const onFiles = (list: FileList | null) => {
    const picked = list?.[0]
    if (!picked) return
    startWithFile({ name: picked.name, sizeLabel: formatSize(picked.size) })
  }

  useEffect(() => {
    if (phase !== 'extracting') return
    const start = performance.now()
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / EXTRACT_DURATION_MS)
      setExtractedCount(Math.round(easeOutCubic(t) * TOTAL))
      if (t >= 1) {
        setPhase('done')
        return
      }
      rafRef.current = requestAnimationFrame(tick)
    }
    rafRef.current = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(rafRef.current)
  }, [phase])

  // Hero timeline: each sampled item spawns as a flying card over the scan,
  // holds long enough to register, then flips to 'listed' — the layoutId
  // morph compresses it into a row at the top of the extracted list.
  useEffect(() => {
    if (phase !== 'extracting') return
    const timers: number[] = []
    HERO_ITEMS.forEach((item, index) => {
      timers.push(
        window.setTimeout(() => {
          if (reduceMotion) {
            setHeroes((prev) => [...prev, { item, stage: 'listed' }])
            return
          }
          setHeroes((prev) => [...prev, { item, stage: 'flying' }])
          timers.push(
            window.setTimeout(() => {
              setHeroes((prev) =>
                prev.map((hero) =>
                  hero.item.id === item.id ? { ...hero, stage: 'listed' } : hero,
                ),
              )
            }, HERO_HOLD_MS),
          )
        }, HERO_FIRST_DELAY_MS + index * HERO_INTERVAL_MS),
      )
    })
    return () => timers.forEach((timer) => window.clearTimeout(timer))
  }, [phase, reduceMotion])

  // Preload hero product images so no card flies with an empty thumbnail.
  useEffect(() => {
    if (phase !== 'extracting') return
    HERO_ITEMS.forEach((item) => {
      const img = new Image()
      img.src = item.image
    })
  }, [phase])

  const voice =
    phase === 'upload'
      ? { expression: 'reading' as const, line: "Drop me the catalog. I'll do the reading." }
      : phase === 'done'
        ? {
            expression: 'proud' as const,
            line: `Read all ${TOTAL}. Flagged ${FLAGGED_COUNT} for you 😌`,
          }
        : extractionVoice(extractedCount)

  return (
    <OnboardingLayout
      step={1}
      title={voice.line}
      nextTo="/onboarding/offer"
      nextLabel="That's my catalog →"
      hideCta={phase !== 'done'}
      bobbyExpression={voice.expression}
    >
      <input
        ref={inputRef}
        type="file"
        accept="application/pdf,.pdf"
        className="sr-only"
        onChange={(event) => onFiles(event.target.files)}
      />

      <AnimatePresence mode="wait">
        {phase === 'upload' && (
          <motion.div
            key="upload"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.22 }}
            className="mx-auto max-w-xl"
          >
            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              onDragOver={(event) => {
                event.preventDefault()
                setDragging(true)
              }}
              onDragLeave={() => setDragging(false)}
              onDrop={(event) => {
                event.preventDefault()
                setDragging(false)
                onFiles(event.dataTransfer.files)
              }}
              className={`flex w-full cursor-pointer flex-col items-center rounded-xl border border-dashed bg-bg px-6 py-16 transition-colors ${
                dragging ? 'border-accent bg-accent-soft' : 'border-line hover:bg-hover'
              }`}
            >
              <p className="text-sm font-medium text-ink">Drop the Hengxin catalog</p>
              <p className="mt-1 text-xs text-muted">PDF only. I just need the filename.</p>
            </button>
            <button
              type="button"
              onClick={() => startWithFile(SAMPLE_FILE)}
              className="mt-4 cursor-pointer border-0 bg-transparent p-0 text-xs text-muted hover:text-ink"
            >
              Use sample: hengxin-catalog-2026.pdf (2.4 MB)
            </button>
          </motion.div>
        )}

        {phase === 'extracting' && file && (
          <motion.div
            key="extracting"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="flex flex-col items-start gap-5 md:flex-row"
            onClick={finishDone}
          >
            <motion.div
              initial={{ opacity: 0, y: 16, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              transition={{ type: 'spring', stiffness: 220, damping: 24 }}
              className="relative hidden shrink-0 md:block"
            >
              <PdfPage file={file} />
              {heroes
                .filter((hero) => hero.stage === 'flying')
                .map((hero) => (
                  <FlyingCard key={hero.item.id} item={hero.item} />
                ))}
            </motion.div>
            <ExtractionPanel
              count={extractedCount}
              rows={heroes
                .filter((hero) => hero.stage === 'listed')
                .map((hero) => hero.item)
                .reverse()}
              animateLayout={!reduceMotion}
            />
          </motion.div>
        )}

        {phase === 'done' && (
          <motion.div
            key="done"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3 }}
          >
            <CatalogBrowser />
          </motion.div>
        )}
      </AnimatePresence>
    </OnboardingLayout>
  )
}
