import { useEffect, useMemo, useRef, useState } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
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
  sku: string | null
  notes: string
  flagged: boolean
  confidence: number
}

const SAMPLE_FILE: CatalogFile = {
  name: 'Sample catalog',
  sizeLabel: 'text',
}

const MOCK_ITEMS: CatalogItem[] = [
  { id: 'hx-sf-04', name: 'Lingnan Sofa', sku: 'HX-SF-04', notes: 'oak frame, linen · matte oil · removable covers, FSC Mix', flagged: false, confidence: 0.92 },
  { id: 'hx-ch-12', name: 'Canton Lounge Chair', sku: 'HX-CH-12', notes: 'walnut, leather · satin lacquer · kiln-dried frame', flagged: false, confidence: 0.9 },
  { id: 'hx-tb-08', name: 'Pearl River Dining Table', sku: 'HX-TB-08', notes: 'solid ash · natural oil · M8 table bolts', flagged: false, confidence: 0.88 },
  { id: 'hx-hd-21', name: 'Crossbar Handle', sku: 'HX-HD-21', notes: '304 stainless · brushed nickel · M4 x 25 mm', flagged: true, confidence: 0.46 },
]

const INITIAL_VISIBLE = 48

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

function isPdfFile(file: File) {
  if (file.type === 'application/pdf') return true
  return file.name.toLowerCase().endsWith('.pdf')
}

function confidenceTone(confidence: number): 'high' | 'mid' | 'low' {
  if (confidence >= 0.75) return 'high'
  if (confidence >= 0.5) return 'mid'
  return 'low'
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
        <FurniturePlaceholder />
      </motion.div>
      <motion.div layout="position" className="p-2">
        <p className="truncate text-xs font-medium text-ink">{item.name}</p>
        <p className="truncate text-[0.68rem] text-muted">{item.sku ?? 'Reading…'}</p>
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
        <FurniturePlaceholder />
      </motion.div>
      <motion.p
        layout={animateLayout ? 'position' : undefined}
        className="min-w-0 flex-1 truncate text-xs text-ink"
      >
        {item.name}
      </motion.p>
    </motion.div>
  )
}

function ExtractionPanel({
  rows,
  animateLayout,
  chunkIndex,
  chunkCount,
}: {
  rows: CatalogItem[]
  animateLayout: boolean
  chunkIndex: number
  chunkCount: number
}) {
  const progress = chunkCount > 0 ? Math.min(1, chunkIndex / chunkCount) : 0
  return (
    <div className="min-w-0 flex-1 rounded-xl border border-black/8 bg-bg p-6 shadow-[0_4px_12px_rgba(15,15,15,0.08)]">
      <p className="text-lg font-semibold tracking-tight text-ink">Reading the catalog…</p>
      <p className="mt-1 text-sm text-muted">
        {chunkCount > 0
          ? `Page ${Math.min(chunkIndex + 1, chunkCount)} of ${chunkCount} · ${rows.length} names so far`
          : 'Extracting SKUs from the catalog'}
      </p>

      <div className="mt-4 h-1.5 overflow-hidden rounded-full bg-black/8">
        <motion.div
          className="h-full rounded-full bg-accent"
          animate={{ width: `${Math.max(progress * 100, chunkCount === 0 ? 18 : 0)}%` }}
          transition={{ duration: 0.25, ease: 'easeOut' }}
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
    </div>
  )
}

type Filter = 'All' | 'Flagged'

function cardToneClass(item: CatalogItem) {
  const tone = confidenceTone(item.confidence)
  if (tone === 'low') {
    return {
      article: 'border-warn/40 bg-warn-soft/40',
      name: 'text-warn',
      meta: 'text-warn/80',
    }
  }
  if (tone === 'mid') {
    return {
      article: 'border-warn/20 bg-bg',
      name: 'text-muted',
      meta: 'text-faint',
    }
  }
  return {
    article: 'border-black/8 bg-bg',
    name: 'text-ink',
    meta: 'text-faint',
  }
}

function CatalogBrowser({ items }: { items: CatalogItem[] }) {
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState<Filter>('All')
  const [showAll, setShowAll] = useState(false)

  const flaggedCount = items.filter((item) => item.flagged).length

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return items.filter((item) => {
      if (filter === 'Flagged' && !item.flagged) return false
      if (!q) return true
      return (
        item.name.toLowerCase().includes(q)
        || (item.sku?.toLowerCase().includes(q) ?? false)
        || item.notes.toLowerCase().includes(q)
      )
    })
  }, [items, query, filter])

  const visible = showAll ? filtered : filtered.slice(0, INITIAL_VISIBLE)

  return (
    <div>
      <div className="flex flex-wrap items-center gap-x-6 gap-y-2 rounded-xl border border-black/8 bg-bg px-5 py-4">
        <p className="text-sm text-ink">
          <span className="font-semibold">{items.length} products</span>
        </p>
        <p className="text-sm text-warn">
          ⚠ {flaggedCount} flagged for review
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
          placeholder={`Search ${items.length} products…`}
          className="w-56 rounded-lg border border-black/10 bg-bg px-3 py-1.5 text-sm text-ink placeholder:text-faint focus:border-accent focus:outline-none"
        />
        {(['All', 'Flagged'] as Filter[]).map((option) => (
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
            {option === 'Flagged' ? `⚠ Flagged (${flaggedCount})` : option}
          </button>
        ))}
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
        {visible.map((item) => {
          const tone = cardToneClass(item)
          return (
            <article
              key={item.id}
              className={`overflow-hidden rounded-lg border transition-shadow hover:shadow-[0_4px_12px_rgba(15,15,15,0.08)] ${tone.article}`}
            >
              <div className="relative aspect-[4/3] overflow-hidden bg-sidebar">
                <FurniturePlaceholder />
              </div>
              <div className="p-2.5">
                <p className={`truncate text-xs font-medium ${tone.name}`}>{item.name}</p>
                <p className={`truncate text-[0.68rem] ${tone.meta}`}>{item.sku ?? '—'}</p>
                {item.notes && (
                  <p className={`mt-1 line-clamp-2 text-[0.68rem] ${tone.meta}`}>{item.notes}</p>
                )}
                <div className="mt-1.5 flex items-center justify-between gap-2">
                  <p className={`text-[0.6rem] tabular-nums ${tone.meta}`}>
                    {Math.round(item.confidence * 100)}%
                  </p>
                  {item.flagged && (
                    <span className="shrink-0 rounded bg-warn-soft px-1 py-0.5 text-[0.6rem] font-medium text-warn">
                      ⚠ review
                    </span>
                  )}
                </div>
              </div>
            </article>
          )
        })}
      </div>

      {filtered.length === 0 && (
        <p className="py-12 text-center text-sm text-muted">
          {items.length === 0
            ? 'No products came back from this catalog.'
            : 'Nothing matches — try another name or SKU.'}
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

export function Catalog() {
  const [phase, setPhase] = useState<Phase>('upload')
  const [file, setFile] = useState<CatalogFile | null>(null)
  const [items, setItems] = useState<CatalogItem[]>([])
  const [error, setError] = useState<string | null>(null)
  const [dragging, setDragging] = useState(false)
  const [heroes, setHeroes] = useState<CatalogItem[]>([])
  const [chunkIndex, setChunkIndex] = useState(0)
  const [chunkCount, setChunkCount] = useState(0)
  const reduceMotion = Boolean(useReducedMotion())
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (phase !== 'extracting' || !file) return
    let alive = true
    setItems([])
    setHeroes([])
    setChunkIndex(0)
    setChunkCount(MOCK_ITEMS.length)

    const timers = MOCK_ITEMS.map((item, index) =>
      window.setTimeout(() => {
        if (!alive) return
        setChunkIndex(index + 1)
        setHeroes((prev) => [item, ...prev].slice(0, 12))
        if (index === MOCK_ITEMS.length - 1) {
          setItems(MOCK_ITEMS)
          setPhase('done')
        }
      }, 160 * (index + 1)),
    )

    return () => {
      alive = false
      timers.forEach((id) => window.clearTimeout(id))
    }
  }, [phase, file])

  const runExtract = (nextFile: CatalogFile) => {
    setError(null)
    setFile(nextFile)
    setPhase('extracting')
  }

  const onFiles = (list: FileList | null) => {
    const picked = list?.[0]
    if (!picked) return
    if (!isPdfFile(picked)) {
      setError('Please drop a PDF catalog.')
      return
    }
    runExtract({ name: picked.name, sizeLabel: formatSize(picked.size) })
  }

  const flaggedCount = items.filter((item) => item.flagged).length
  const voice =
    phase === 'upload'
      ? { expression: 'reading' as const, line: "Drop me the catalog. I'll do the reading." }
      : phase === 'done'
        ? {
            expression: 'proud' as const,
            line: `Read ${items.length}. Flagged ${flaggedCount} for you 😌`,
          }
        : { expression: 'reading' as BobbyExpression, line: 'Reading the catalog…' }

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
              <p className="mt-1 text-xs text-muted">
                PDF. I will extract every SKU from the pages.
              </p>
            </button>
            <button
              type="button"
              onClick={() => void runExtract(SAMPLE_FILE)}
              className="mt-4 cursor-pointer border-0 bg-transparent p-0 text-xs text-muted hover:text-ink"
            >
              Use sample catalog text
            </button>
            {error && (
              <p className="mt-3 text-sm text-warn">{error}</p>
            )}
          </motion.div>
        )}

        {phase === 'extracting' && file && (
          <motion.div
            key="extracting"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="flex flex-col items-start gap-5 md:flex-row"
          >
            <motion.div
              initial={{ opacity: 0, y: 16, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              transition={{ type: 'spring', stiffness: 220, damping: 24 }}
              className="relative hidden shrink-0 md:block"
            >
              <PdfPage file={file} />
              {!reduceMotion && heroes[0] && <FlyingCard item={heroes[0]} />}
            </motion.div>
            <ExtractionPanel
              rows={heroes}
              animateLayout={!reduceMotion}
              chunkIndex={chunkIndex}
              chunkCount={chunkCount}
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
            <CatalogBrowser items={items} />
          </motion.div>
        )}
      </AnimatePresence>
    </OnboardingLayout>
  )
}
