import { motion, useReducedMotion } from 'framer-motion'
import { useId } from 'react'

export type BobbyExpression =
  | 'happy'
  | 'neutral'
  | 'reading'
  | 'excited'
  | 'worried'
  | 'proud'
  | 'cool'

type FaceProps = {
  expression?: BobbyExpression
  size?: number
  /** drop the soft cast shadow under the ball (on by default) */
  shadow?: boolean
}

/*
  Bobby, the export desk agent — a glossy 3D ball, rendered in SVG.

  Depth comes from layered light: a radial skin gradient (lit from the
  upper left), a blurred specular highlight, a bounce light at the
  bottom rim, and tiny catchlights in the eyes.

  Expressions still ride the shared morphing skeleton
  (à la benji.org/morphing-icons-with-claude): every expression is
  exactly four stroked `M x y Q qx qy x y` paths — left eye, right eye,
  mouth, one spare accessory line — so features genuinely MORPH between
  states. Unused parts collapse to invisible points.
*/

type Part = { d: string; sw: number; o?: number }
type Gloss = { x: number; y: number; r: number; o: number }
type Face = {
  eyeL: Part
  eyeR: Part
  mouth: Part
  extra: Part
  glossL: Gloss
  glossR: Gloss
}

const HIDDEN: Part = { d: 'M28 23 Q28 23 28 23', sw: 2, o: 0 }

const dot = (x: number, y: number, sw: number): Part => ({
  d: `M${x} ${y} Q${x} ${y} ${x} ${y}`,
  sw,
})

const catchlight = (x: number, y: number, r = 1.15, o = 0.9): Gloss => ({ x, y, r, o })
const noGloss = (x: number, y: number): Gloss => ({ x, y, r: 0.6, o: 0 })

const FACES: Record<BobbyExpression, Face> = {
  happy: {
    eyeL: dot(20, 24, 6.2),
    eyeR: dot(36, 24, 6.2),
    mouth: { d: 'M19 34 Q28 41.5 37 34', sw: 2.6 },
    extra: HIDDEN,
    glossL: catchlight(18.9, 22.8),
    glossR: catchlight(34.9, 22.8),
  },
  neutral: {
    eyeL: dot(20, 24, 6.2),
    eyeR: dot(36, 24, 6.2),
    mouth: { d: 'M20 35 Q28 35 36 35', sw: 2.5 },
    extra: HIDDEN,
    glossL: catchlight(18.9, 22.8),
    glossR: catchlight(34.9, 22.8),
  },
  reading: {
    // focused ∩ ∩ eyes, small round mouth
    eyeL: { d: 'M16 23.5 Q20 19.5 24 23.5', sw: 2.4 },
    eyeR: { d: 'M32 23.5 Q36 19.5 40 23.5', sw: 2.4 },
    mouth: { d: 'M28 34.5 Q28 35.5 28 35.5', sw: 6 },
    extra: HIDDEN,
    glossL: noGloss(20, 22),
    glossR: noGloss(36, 22),
  },
  excited: {
    eyeL: dot(20, 23, 7.4),
    eyeR: dot(36, 23, 7.4),
    // vertical capsule = wide open mouth
    mouth: { d: 'M28 33.5 Q28 38.5 28 38.5', sw: 8.5 },
    extra: HIDDEN,
    glossL: catchlight(18.7, 21.6, 1.45, 0.95),
    glossR: catchlight(34.7, 21.6, 1.45, 0.95),
  },
  worried: {
    // eyes slant inward like knitted brows
    eyeL: { d: 'M16.5 21.5 Q19.5 23.2 22.5 25', sw: 4.8 },
    eyeR: { d: 'M39.5 21.5 Q36.5 23.2 33.5 25', sw: 4.8 },
    mouth: { d: 'M28 36.5 Q28 39.5 28 39.5', sw: 7 },
    extra: HIDDEN,
    glossL: catchlight(17.2, 21.2, 0.85, 0.75),
    glossR: catchlight(38.8, 21.2, 0.85, 0.75),
  },
  proud: {
    // big arched happy eyes + wide grin
    eyeL: { d: 'M15 24 Q20 18.5 25 24', sw: 2.6 },
    eyeR: { d: 'M31 24 Q36 18.5 41 24', sw: 2.6 },
    mouth: { d: 'M18 34 Q28 43.5 38 34', sw: 2.6 },
    extra: HIDDEN,
    glossL: noGloss(20, 22),
    glossR: noGloss(36, 22),
  },
  cool: {
    // eyes stretch flat and thick into sunglass lenses; the spare
    // line fades in as the bridge between them
    eyeL: { d: 'M13.5 23.5 Q19 23.5 24.5 23.5', sw: 7 },
    eyeR: { d: 'M31.5 23.5 Q37 23.5 42.5 23.5', sw: 7 },
    mouth: { d: 'M20 35.5 Q28 40 36 34', sw: 2.5 },
    extra: { d: 'M24.5 23.5 Q28 23.5 31.5 23.5', sw: 2.2, o: 1 },
    // lens glare instead of eye catchlight
    glossL: catchlight(16.5, 22.3, 1.05, 0.5),
    glossR: catchlight(34.5, 22.3, 1.05, 0.5),
  },
}

const morph = { type: 'spring', stiffness: 300, damping: 22 } as const

function FeaturePath({ part }: { part: Part }) {
  return (
    <motion.path
      initial={false}
      animate={{ d: part.d, strokeWidth: part.sw, opacity: part.o ?? 1 }}
      transition={morph}
      stroke="#141310"
      fill="none"
      strokeLinecap="round"
    />
  )
}

export function BobbyFace({ expression = 'happy', size = 48, shadow = true }: FaceProps) {
  const face = FACES[expression]
  const uid = useId().replace(/:/g, '')
  const skin = `bskin-${uid}`
  const rim = `brim-${uid}`
  const blur = `bblur-${uid}`

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 56 56"
      aria-hidden
      style={{
        display: 'block',
        flexShrink: 0,
        filter: shadow ? 'drop-shadow(0 5px 9px rgba(2, 9, 58, 0.22))' : undefined,
        overflow: 'visible',
      }}
    >
      <defs>
        {/* monotone skin: one marigold hue, shaded light → dark */}
        <radialGradient id={skin} cx="36%" cy="28%" r="80%">
          <stop offset="0%" stopColor="#ffd45c" />
          <stop offset="45%" stopColor="#ffb110" />
          <stop offset="80%" stopColor="#ef9d00" />
          <stop offset="100%" stopColor="#d88a00" />
        </radialGradient>
        {/* rim darkening to round off the sphere — same hue, deeper */}
        <radialGradient id={rim} cx="50%" cy="45%" r="55%">
          <stop offset="70%" stopColor="#000" stopOpacity="0" />
          <stop offset="96%" stopColor="#a56a00" stopOpacity="0.26" />
          <stop offset="100%" stopColor="#8f5b00" stopOpacity="0.38" />
        </radialGradient>
        <filter id={blur} x="-60%" y="-60%" width="220%" height="220%">
          <feGaussianBlur stdDeviation="2.1" />
        </filter>
      </defs>

      {/* the ball */}
      <circle cx="28" cy="28" r="25" fill={`url(#${skin})`} />
      <circle cx="28" cy="28" r="25" fill={`url(#${rim})`} />

      {/* specular highlight, upper left */}
      <ellipse
        cx="18.5"
        cy="14"
        rx="8.5"
        ry="5"
        fill="#fff"
        opacity="0.55"
        filter={`url(#${blur})`}
        transform="rotate(-28 18.5 14)"
      />
      {/* tight hot spot inside the highlight */}
      <ellipse
        cx="16.8"
        cy="12.8"
        rx="3.4"
        ry="1.9"
        fill="#fff"
        opacity="0.8"
        filter={`url(#${blur})`}
        transform="rotate(-28 16.8 12.8)"
      />
      {/* bounce light along the bottom rim — same hue, lighter */}
      <ellipse
        cx="28"
        cy="47"
        rx="14"
        ry="4.2"
        fill="#ffd45c"
        opacity="0.55"
        filter={`url(#${blur})`}
      />

      {/* morphing features */}
      <g className="bobby-blink">
        <FeaturePath part={face.eyeL} />
        <FeaturePath part={face.eyeR} />
        <FeaturePath part={face.extra} />
        {/* eye catchlights — the little white dots that sell the gloss */}
        <motion.circle
          initial={false}
          animate={{ cx: face.glossL.x, cy: face.glossL.y, r: face.glossL.r, opacity: face.glossL.o }}
          transition={morph}
          fill="#fff"
        />
        <motion.circle
          initial={false}
          animate={{ cx: face.glossR.x, cy: face.glossR.y, r: face.glossR.r, opacity: face.glossR.o }}
          transition={morph}
          fill="#fff"
        />
      </g>
      <FeaturePath part={face.mouth} />
    </svg>
  )
}

type DockProps = {
  expression?: BobbyExpression
  size?: number
}

/**
 * Corner-docked Bobby: floating glossy ball fixed to the bottom-right
 * of the viewport. The expression carries the mood; the page heading
 * carries the words.
 */
export function BobbyDock({ expression = 'happy', size = 56 }: DockProps) {
  const reduce = useReducedMotion()
  return (
    <div className="pointer-events-none fixed bottom-6 right-6 z-40">
      <motion.div
        animate={reduce ? undefined : { y: [0, -6, 0] }}
        transition={{ duration: 2.6, repeat: Infinity, ease: 'easeInOut' }}
      >
        <BobbyFace expression={expression} size={size} />
      </motion.div>
    </div>
  )
}
