import { Link } from 'react-router-dom'
import type { ReactNode } from 'react'

type ButtonProps = {
  to: string
  children: ReactNode
  variant?: 'primary' | 'ghost' | 'dark'
}

export function ButtonLink({ to, children, variant = 'primary' }: ButtonProps) {
  const styles = {
    primary: 'bg-accent text-white hover:bg-accent/90',
    ghost: 'bg-bg text-ink border border-line hover:bg-hover',
    dark: 'bg-ink text-bg hover:bg-ink/90',
  }[variant]

  return (
    <Link
      to={to}
      className={`inline-flex items-center justify-center rounded-md px-3.5 py-1.5 text-sm font-medium no-underline transition-colors ${styles}`}
    >
      {children}
    </Link>
  )
}

export function StatusPill({
  children,
  tone = 'neutral',
}: {
  children: ReactNode
  tone?: 'neutral' | 'live' | 'warn' | 'good'
}) {
  const tones = {
    neutral: 'bg-hover text-muted',
    live: 'bg-accent-soft text-accent',
    warn: 'bg-warn-soft text-warn',
    good: 'bg-good-soft text-good',
  }[tone]

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded px-2 py-0.5 text-[0.72rem] font-medium ${tones}`}
    >
      {children}
    </span>
  )
}

export function LiveDot() {
  return (
    <span className="relative flex h-1.5 w-1.5">
      <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-accent opacity-60" />
      <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-accent" />
    </span>
  )
}
