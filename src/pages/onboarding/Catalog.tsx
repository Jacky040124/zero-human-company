import { useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { catalog } from '../../data'
import type { Product } from '../../data'
import type { BobbyExpression } from '../../components/Bobby'
import { OnboardingLayout } from './OnboardingLayout'

type Phase = 'upload' | 'extracting' | 'done'

type CatalogFile = {
  name: string
  sizeLabel: string
}

const SAMPLE_FILE: CatalogFile = {
  name: 'hengxin-catalog-2026.pdf',
  sizeLabel: '2.4 MB',
}

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

function FurniturePlaceholder() {
  return (
    <svg viewBox="0 0 160 120" className="h-full w-full text-faint" aria-hidden>
      <rect x="18" y="48" width="124" height="36" rx="4" fill="none" stroke="currentColor" strokeWidth="1.5" />
      <path d="M28 48v-8a8 8 0 0 1 8-8h88a8 8 0 0 1 8 8v8" fill="none" stroke="currentColor" strokeWidth="1.5" />
      <path d="M30 84v12M130 84v12M18 70h124" fill="none" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  )
}

function ProductImage({ src, alt }: { src: string; alt: string }) {
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading')

  return (
    <div className="relative aspect-[4/3] overflow-hidden bg-sidebar">
      {status === 'error' ? (
        <FurniturePlaceholder />
      ) : (
        <img
          src={src}
          alt={alt}
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

function isSofa(product: Product) {
  return product.id === 'hx-sofa-04'
}

function isLastExtracted(product: Product) {
  return product.id === 'hx-bed-03'
}

function ProductCard({
  product,
  instant,
  showTags,
}: {
  product: Product
  instant: boolean
  showTags: boolean
}) {
  const warn = isSofa(product)
  const lastWarn = isLastExtracted(product)

  return (
    <motion.article
      layout
      initial={instant ? false : { scale: 0.2, rotate: -8, x: -120, y: 24, opacity: 0.85 }}
      animate={{ scale: 1, rotate: 0, x: 0, y: 0, opacity: 1 }}
      transition={{ type: 'spring', stiffness: 280, damping: 20 }}
      className="overflow-hidden rounded-xl border border-black/8 bg-bg shadow-[0_4px_12px_rgba(15,15,15,0.1)]"
    >
      <ProductImage src={product.image} alt={product.name} />
      <div className="p-3">
        <p className="text-sm font-medium text-ink">{product.name}</p>
        <p className="text-xs text-muted">{product.nameZh}</p>
        <p className="mt-2 text-sm text-ink">{product.price}</p>
        <p className="mt-0.5 text-xs text-muted">MOQ {product.moq}</p>
        {showTags && (
          <div className="mt-2">
            {warn ? (
              <span className="rounded px-1.5 py-0.5 text-[0.65rem] font-medium bg-warn-soft text-warn">
                check fabric options
              </span>
            ) : (
              <span className="rounded px-1.5 py-0.5 text-[0.65rem] font-medium bg-good-soft text-good">
                98% extracted
              </span>
            )}
          </div>
        )}
        {!showTags && lastWarn && (
          <div className="mt-2">
            <span className="rounded px-1.5 py-0.5 text-[0.65rem] font-medium bg-warn-soft text-warn">
              ⚠ fabric options?
            </span>
          </div>
        )}
      </div>
    </motion.article>
  )
}

function PdfPage({ file }: { file: CatalogFile }) {
  return (
    <div className="relative h-[28rem] w-[17rem] overflow-hidden rounded-xl border border-black/8 bg-bg shadow-[0_4px_12px_rgba(15,15,15,0.1)]">
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

function extractionVoice(count: number): { expression: BobbyExpression; line: string } {
  if (count < 2) {
    return { expression: 'reading', line: 'Page 12… the oak table looks strong 👀' }
  }
  return { expression: 'excited', line: 'Pulling them out one by one… 🔍' }
}

export function Catalog() {
  const [phase, setPhase] = useState<Phase>('upload')
  const [file, setFile] = useState<CatalogFile | null>(null)
  const [dragging, setDragging] = useState(false)
  const [pdfShifted, setPdfShifted] = useState(false)
  const [pdfHurling, setPdfHurling] = useState(false)
  const [pdfGone, setPdfGone] = useState(false)
  const [extractedCount, setExtractedCount] = useState(0)
  const [skipped, setSkipped] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  const finishDone = () => {
    setExtractedCount(catalog.length)
    setPdfShifted(true)
    setPdfHurling(false)
    setPdfGone(true)
    setPhase('done')
  }

  const startWithFile = (next: CatalogFile) => {
    setFile(next)
    setSkipped(false)
    setPdfShifted(false)
    setPdfHurling(false)
    setPdfGone(false)
    setExtractedCount(0)
    setPhase('extracting')
  }

  const onFiles = (list: FileList | null) => {
    const picked = list?.[0]
    if (!picked) return
    startWithFile({ name: picked.name, sizeLabel: formatSize(picked.size) })
  }

  useEffect(() => {
    if (phase !== 'extracting') return
    const timers: number[] = []
    timers.push(window.setTimeout(() => setPdfShifted(true), 1500))
    catalog.forEach((_, index) => {
      timers.push(
        window.setTimeout(() => setExtractedCount(index + 1), 2000 + index * 900),
      )
    })
    const lastCardAt = 2000 + (catalog.length - 1) * 900
    timers.push(window.setTimeout(() => setPdfHurling(true), lastCardAt + 700))
    timers.push(window.setTimeout(finishDone, lastCardAt + 1400))
    return () => timers.forEach((id) => window.clearTimeout(id))
  }, [phase])

  const voice =
    phase === 'upload'
      ? { expression: 'reading' as const, line: "Drop me the catalog. I'll do the reading." }
      : phase === 'done'
        ? { expression: 'proud' as const, line: 'Read it. Stripped it. All yours 😌' }
        : extractionVoice(extractedCount)

  return (
    <OnboardingLayout
      step={1}
      title={voice.line}
      nextTo="/onboarding/offer"
      nextLabel="That's my catalog →"
      hideCta={phase !== 'done'}
      bobbyExpression={voice.expression}
      bobbyLineKey={voice.line}
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

        {(phase === 'extracting' || phase === 'done') && file && (
          <motion.div
            key="stage"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            layout
            className={`flex min-h-[28rem] items-start ${
              pdfShifted && !pdfGone ? 'justify-start gap-5' : 'justify-center'
            }`}
            onClick={() => {
              if (phase === 'extracting') {
                setSkipped(true)
                finishDone()
              }
            }}
          >
            <AnimatePresence>
              {!pdfGone && (
                <motion.div
                  key="pdf"
                  layout
                  initial={{ opacity: 0, y: 16, scale: 0.96 }}
                  animate={
                    pdfHurling
                      ? { x: '-140%', rotate: -6, opacity: 0 }
                      : { opacity: 1, y: 0, scale: 1, x: 0, rotate: 0 }
                  }
                  transition={{ type: 'spring', stiffness: 220, damping: 24 }}
                  className="shrink-0"
                >
                  <PdfPage file={file} />
                </motion.div>
              )}
            </AnimatePresence>

            {extractedCount > 0 && (
              <motion.div
                layout
                className={`grid grid-cols-2 gap-3 ${pdfGone ? 'w-full' : 'min-w-0 flex-1'}`}
              >
                {catalog.slice(0, extractedCount).map((product) => (
                  <ProductCard
                    key={product.id}
                    product={product}
                    instant={skipped || phase === 'done'}
                    showTags={phase === 'done'}
                  />
                ))}
              </motion.div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </OnboardingLayout>
  )
}
