import { useLayoutEffect, useRef, useState } from 'react'
import { motion, useMotionValue, useMotionValueEvent } from 'framer-motion'
import { catalog } from '../../data'
import type { Product } from '../../data'
import type { BobbyExpression } from '../../components/Bobby'
import { OnboardingLayout } from './OnboardingLayout'

const TERMS: Array<[string, string]> = [
  ['Payment', '30/70 T/T'],
  ['Incoterms', 'FOB Shenzhen'],
  ['Lead', '35 days'],
  ['MOQ', '1×40HQ'],
  ['Cert', 'FSC Mix'],
]

const SOFA = catalog[0]

function costOf(product: Product) {
  return Math.round(product.floor * 0.92)
}

function sofaVoice(floor: number): { expression: BobbyExpression; line: string } {
  if (floor <= 152) {
    return {
      expression: 'worried',
      line: `€${floor}?! That's cutting into the wood, boss 😰`,
    }
  }
  if (floor <= 156) {
    return { expression: 'excited', line: "Now THAT'S negotiating room 😏" }
  }
  if (floor >= 166) {
    return { expression: 'neutral', line: 'Not much room to dance, boss.' }
  }
  return {
    expression: 'happy',
    line: 'My rules: charm at list, fight at target, never cross the red dot 🫡',
  }
}

function StaticTrack({ product }: { product: Product }) {
  const cost = costOf(product)
  const span = product.list - cost
  const floorPct = ((product.floor - cost) / span) * 100
  const targetPct = ((product.target - cost) / span) * 100

  return (
    <div className="relative h-10">
      <div className="absolute top-1/2 h-1.5 w-full -translate-y-1/2 rounded-full bg-line" />
      <div
        className="absolute top-1/2 h-1.5 -translate-y-1/2 rounded-full"
        style={{
          left: `${floorPct}%`,
          width: `${100 - floorPct}%`,
          background: 'linear-gradient(to right, var(--color-danger-soft), var(--color-good-soft))',
        }}
      />
      <Marker left={floorPct} color="bg-danger" label={`€${product.floor}`} tone="text-danger" />
      <Marker left={targetPct} color="bg-good" label={`€${product.target}`} tone="text-good" />
      <Marker left={100} color="bg-ink" label={`€${product.list}`} tone="text-ink" />
    </div>
  )
}

function Marker({
  left,
  color,
  label,
  tone,
}: {
  left: number
  color: string
  label: string
  tone: string
}) {
  return (
    <div
      className="absolute top-1/2 -translate-x-1/2 -translate-y-1/2"
      style={{ left: `${left}%` }}
    >
      <div className={`h-2.5 w-2.5 rounded-full ${color}`} />
      <p className={`absolute top-4 left-1/2 -translate-x-1/2 whitespace-nowrap text-[0.65rem] ${tone}`}>
        {label}
      </p>
    </div>
  )
}

function DraggableFloor({
  product,
  value,
  onChange,
}: {
  product: Product
  value: number
  onChange: (next: number) => void
}) {
  const trackRef = useRef<HTMLDivElement>(null)
  const [width, setWidth] = useState(0)
  const cost = costOf(product)
  const span = product.list - cost
  const x = useMotionValue(0)
  const valueRef = useRef(value)
  const widthRef = useRef(width)
  valueRef.current = value
  widthRef.current = width

  useLayoutEffect(() => {
    const el = trackRef.current
    if (!el) return
    const measure = () => setWidth(el.offsetWidth)
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  useLayoutEffect(() => {
    if (width === 0) return
    x.set(((valueRef.current - cost) / span) * width)
  }, [width, cost, span, x])

  useMotionValueEvent(x, 'change', (latest) => {
    const trackWidth = widthRef.current
    if (trackWidth === 0) return
    const raw = cost + (latest / trackWidth) * span
    const next = Math.round(Math.min(product.target, Math.max(cost, raw)))
    if (next !== valueRef.current) onChange(next)
  })

  const floorPct = ((value - cost) / span) * 100
  const targetPct = ((product.target - cost) / span) * 100
  const maxX = ((product.target - cost) / span) * width

  return (
    <div ref={trackRef} className="relative h-12">
      <div className="absolute top-1/2 h-1.5 w-full -translate-y-1/2 rounded-full bg-line" />
      <div
        className="absolute top-1/2 h-1.5 -translate-y-1/2 rounded-full"
        style={{
          left: `${floorPct}%`,
          width: `${100 - floorPct}%`,
          background: 'linear-gradient(to right, var(--color-danger-soft), var(--color-good-soft))',
        }}
      />
      <Marker left={targetPct} color="bg-good" label={`€${product.target}`} tone="text-good" />
      <Marker left={100} color="bg-ink" label={`€${product.list}`} tone="text-ink" />
      {width > 0 && (
        <motion.div
          drag="x"
          dragConstraints={{ left: 0, right: maxX }}
          dragElastic={0}
          dragMomentum={false}
          style={{ x }}
          className="absolute top-1/2 z-10 -translate-y-1/2 cursor-grab active:cursor-grabbing"
        >
          <div className="-translate-x-1/2">
            <div className="h-4 w-4 rounded-full bg-danger shadow-[0_4px_12px_rgba(15,15,15,0.1)]" />
            <p className="absolute top-5 left-1/2 -translate-x-1/2 whitespace-nowrap text-[0.65rem] font-medium text-danger">
              €{value}
            </p>
          </div>
        </motion.div>
      )}
    </div>
  )
}

export function Offer() {
  const [sofaFloor, setSofaFloor] = useState(SOFA.floor)
  const voice = sofaVoice(sofaFloor)

  return (
    <OnboardingLayout
      step={2}
      title={voice.line}
      subtitle="Workers negotiate freely above the floor. Below it, they must ask you."
      nextTo="/onboarding/outreach"
      nextLabel="Those are my rules →"
      bobbyExpression={voice.expression}
    >
      <div className="flex flex-wrap gap-x-6 gap-y-2 text-sm">
        {TERMS.map(([label, value]) => (
          <div key={label} className="flex gap-2">
            <span className="text-muted">{label}</span>
            <span className="text-ink">{value}</span>
          </div>
        ))}
      </div>

      <div className="mt-8 flex flex-wrap items-center gap-3 text-[0.65rem] text-muted">
        <span className="flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full bg-danger" /> Floor
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full bg-good" /> Target
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full bg-ink" /> List
        </span>
      </div>

      <div className="mt-4 space-y-3">
        {catalog.map((product, index) => (
          <div key={product.id} className="rounded-xl border border-line bg-bg px-5 py-4">
            <div className="mb-3 flex items-baseline justify-between gap-3">
              <div>
                <p className="text-sm font-medium text-ink">{product.name}</p>
                <p className="text-xs text-muted">{product.nameZh}</p>
              </div>
              <p className="text-xs text-faint">per {product.unit}</p>
            </div>
            {index === 0 ? (
              <DraggableFloor product={product} value={sofaFloor} onChange={setSofaFloor} />
            ) : (
              <StaticTrack product={product} />
            )}
          </div>
        ))}
      </div>
    </OnboardingLayout>
  )
}
