import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { AnimatePresence, motion } from 'framer-motion'
import { Logo } from '../../components/Logo'
import { BobbyDock } from '../../components/Bobby'
import type { BobbyExpression } from '../../components/Bobby'

const steps = [
  { path: '/onboarding/catalog' },
  { path: '/onboarding/offer' },
  { path: '/onboarding/outreach' },
  { path: '/onboarding/audience' },
  { path: '/onboarding/access' },
]

type Props = {
  step: number
  title: string
  subtitle?: string
  nextTo: string
  nextLabel?: string
  hideCta?: boolean
  bobbyExpression: BobbyExpression
  bobbyLine?: string
  bobbyLineKey?: string
  children: ReactNode
}

export function OnboardingLayout({
  step,
  title,
  subtitle,
  nextTo,
  nextLabel = 'Looks good',
  hideCta = false,
  bobbyExpression,
  bobbyLine,
  bobbyLineKey,
  children,
}: Props) {
  const line = bobbyLine ?? title

  return (
    <div className="min-h-svh bg-canvas">
      <header className="mx-auto flex max-w-6xl items-center justify-between px-6 py-5">
        <Logo />
        <p className="text-sm text-muted">
          Step {step} of {steps.length}
        </p>
      </header>

      <div className="mx-auto flex max-w-6xl gap-2 px-6 pb-6">
        {steps.map((item, index) => (
          <div
            key={item.path}
            className={`h-1 flex-1 rounded-sm ${index < step ? 'bg-accent' : 'bg-line'}`}
          />
        ))}
      </div>

      <main className="mx-auto max-w-6xl px-6 pb-32">
        <AnimatePresence mode="wait">
          <motion.h1
            key={title}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.2 }}
            className="max-w-3xl text-2xl font-semibold tracking-tight text-ink md:text-3xl"
          >
            {title}
          </motion.h1>
        </AnimatePresence>
        {subtitle && (
          <p className="mt-3 max-w-2xl font-serif text-[1.05rem] italic leading-relaxed text-graphite">
            {subtitle}
          </p>
        )}

        <div className="mt-10">{children}</div>

        {!hideCta && (
          <div className="mt-10">
            <Link
              to={nextTo}
              className="inline-flex items-center justify-center rounded-lg bg-accent px-4 py-2.5 text-sm font-medium text-white no-underline transition-colors hover:bg-accent/90"
            >
              {nextLabel}
            </Link>
          </div>
        )}
      </main>

      <BobbyDock expression={bobbyExpression} line={line} lineKey={bobbyLineKey ?? line} />
    </div>
  )
}
