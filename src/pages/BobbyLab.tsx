import { useEffect, useState } from 'react'
import { motion, useMotionValue, useSpring, useTransform } from 'framer-motion'
import { BobbyFace, type BobbyExpression } from '../components/Bobby'
import { Logo } from '../components/Logo'

/*
  Bobby Lab — internal playground page (not linked from the product).
  Shows every expression on the shared morphing skeleton, and a big
  stage where you can click through expressions to watch the features
  genuinely morph between states.
*/

const EXPRESSIONS: { id: BobbyExpression; label: string; note: string }[] = [
  { id: 'happy', label: 'happy', note: '默认状态。圆点眼 + 微笑弧。' },
  { id: 'neutral', label: 'neutral', note: '待命。嘴从弧线拉平成直线。' },
  { id: 'reading', label: 'reading', note: '专注读 PDF。眼睛拱成 ∩,嘴缩成小圆点。' },
  { id: 'excited', label: 'excited', note: '发现线索。眼珠变大,嘴张成竖胶囊。' },
  { id: 'worried', label: 'worried', note: '价格低于地板。眼睛斜压成皱眉,嘴微张。' },
  { id: 'proud', label: 'proud', note: '成交。大眯眯眼 + 咧嘴笑。' },
  { id: 'cool', label: 'cool', note: 'Autopilot。眼睛拉平变粗成墨镜,备用线淡入成镜架。' },
]

/**
 * Big Bobby on a 3D stage: tilts toward the cursor (perspective +
 * rotateX/rotateY), bobs up and down, and casts a soft ground shadow
 * that squashes in sync with the float.
 */
function Stage3D({
  expression,
  onCycle,
}: {
  expression: BobbyExpression
  onCycle: () => void
}) {
  const mx = useMotionValue(0.5)
  const my = useMotionValue(0.5)
  const rotateY = useSpring(useTransform(mx, [0, 1], [-18, 18]), {
    stiffness: 160,
    damping: 18,
  })
  const rotateX = useSpring(useTransform(my, [0, 1], [12, -12]), {
    stiffness: 160,
    damping: 18,
  })

  return (
    <div
      style={{ perspective: 600 }}
      onMouseMove={(e) => {
        const r = e.currentTarget.getBoundingClientRect()
        mx.set((e.clientX - r.left) / r.width)
        my.set((e.clientY - r.top) / r.height)
      }}
      onMouseLeave={() => {
        mx.set(0.5)
        my.set(0.5)
      }}
      className="flex flex-col items-center px-4 pt-2"
    >
      <motion.button
        type="button"
        onClick={onCycle}
        title="点击切换下一个表情"
        style={{ rotateX, rotateY, transformStyle: 'preserve-3d' }}
        whileTap={{ scale: 0.94 }}
        className="cursor-pointer rounded-full"
      >
        <motion.div
          animate={{ y: [0, -10, 0] }}
          transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut' }}
        >
          <BobbyFace expression={expression} size={200} />
        </motion.div>
      </motion.button>
      {/* ground shadow, squashing as Bobby floats */}
      <motion.div
        animate={{ scaleX: [1, 0.82, 1], opacity: [0.35, 0.22, 0.35] }}
        transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut' }}
        className="mt-4 h-4 w-36 rounded-[50%] bg-black/40 blur-md"
      />
    </div>
  )
}

export function BobbyLab() {
  const [current, setCurrent] = useState<BobbyExpression>('happy')
  const [auto, setAuto] = useState(true)

  useEffect(() => {
    if (!auto) return
    const id = setInterval(() => {
      setCurrent((c) => {
        const i = EXPRESSIONS.findIndex((e) => e.id === c)
        return EXPRESSIONS[(i + 1) % EXPRESSIONS.length].id
      })
    }, 1600)
    return () => clearInterval(id)
  }, [auto])

  const activeNote = EXPRESSIONS.find((e) => e.id === current)!

  return (
    <div className="min-h-screen bg-canvas">
      <header className="mx-auto flex max-w-5xl items-center justify-between px-6 py-5">
        <Logo />
        <span className="rounded-full border border-black/10 px-3 py-1 text-xs font-medium text-ink/60">
          Bobby Lab · 表情骨架实验室
        </span>
      </header>

      <main className="mx-auto max-w-5xl px-6 pb-24">
        {/* Stage */}
        <section className="mt-6 rounded-2xl border border-black/8 bg-white p-8 shadow-[0_2px_10px_rgba(15,15,15,0.04)]">
          <div className="flex flex-col items-center gap-6 md:flex-row md:gap-12">
            <Stage3D
              expression={current}
              onCycle={() => {
                setAuto(false)
                const i = EXPRESSIONS.findIndex((e) => e.id === current)
                setCurrent(EXPRESSIONS[(i + 1) % EXPRESSIONS.length].id)
              }}
            />
            <div className="flex-1 text-center md:text-left">
              <div className="font-mono text-sm text-ink/50">{activeNote.label}</div>
              <p className="mt-2 max-w-md text-lg leading-relaxed text-ink">
                {activeNote.note}
              </p>
              <p className="mt-4 text-sm text-ink/50">
                点大脸或下面的卡片切换表情,注意五官是<strong>变形</strong>过去的,
                不是闪切。所有表情共用四条同结构路径:左眼、右眼、嘴、一条备用线。
              </p>
              <button
                type="button"
                onClick={() => setAuto((a) => !a)}
                className={`mt-5 rounded-lg border px-3.5 py-1.5 text-sm font-medium transition-colors ${
                  auto
                    ? 'border-accent bg-accent/10 text-accent'
                    : 'border-black/12 text-ink/70 hover:bg-black/4'
                }`}
              >
                {auto ? '自动循环中 · 点击暂停' : '自动循环已暂停 · 点击开启'}
              </button>
            </div>
          </div>
        </section>

        {/* All expressions grid */}
        <section className="mt-10">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-ink/50">
            全部 {EXPRESSIONS.length} 种表情
          </h2>
          <div className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4">
            {EXPRESSIONS.map((e) => (
              <motion.button
                key={e.id}
                type="button"
                whileHover={{ y: -3 }}
                whileTap={{ scale: 0.97 }}
                onClick={() => {
                  setAuto(false)
                  setCurrent(e.id)
                }}
                className={`flex cursor-pointer flex-col items-center gap-3 rounded-xl border bg-white p-5 text-left transition-shadow ${
                  current === e.id
                    ? 'border-accent shadow-[0_0_0_3px_rgba(9,127,232,0.15)]'
                    : 'border-black/8 hover:shadow-[0_4px_14px_rgba(15,15,15,0.08)]'
                }`}
              >
                <BobbyFace expression={e.id} size={72} />
                <div className="w-full">
                  <div className="font-mono text-xs font-medium text-ink">{e.label}</div>
                  <div className="mt-1 text-xs leading-relaxed text-ink/55">{e.note}</div>
                </div>
              </motion.button>
            ))}
          </div>
        </section>

        {/* Skeleton explainer */}
        <section className="mt-10 rounded-2xl border border-black/8 bg-white p-6">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-ink/50">
            骨架原理
          </h2>
          <p className="mt-3 max-w-2xl text-sm leading-relaxed text-ink/70">
            借鉴{' '}
            <a
              href="https://benji.org/morphing-icons-with-claude"
              target="_blank"
              rel="noreferrer"
              className="text-accent underline"
            >
              benji.org 的 morphing icons
            </a>
            :每个表情都是恰好四条 <code className="rounded bg-black/5 px-1 font-mono text-xs">M x y Q qx qy x y</code>{' '}
            结构的描边路径。圆头线段收缩成点就是眼珠;拉平变粗就是墨镜;拱起控制点就是眯眯眼;
            用不到的线折叠成隐形的点而不是卸载。路径坐标、描边粗细、透明度全部走 spring 插值,
            所以任何表情都能平滑变形成任何其他表情。
          </p>
        </section>
      </main>
    </div>
  )
}
