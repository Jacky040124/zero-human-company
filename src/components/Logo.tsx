import { Link } from 'react-router-dom'

type LogoProps = {
  to?: string
  light?: boolean
}

/*
  Mark: Bobby himself. The brand is the agent — a marigold face with
  the blue ring, same character that runs the product.
*/

function Mark({ size = 22 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 56 56"
      aria-hidden
      style={{ display: 'block', flexShrink: 0 }}
    >
      <circle cx="28" cy="28" r="25" fill="#ffb110" stroke="#097fe8" strokeWidth="3" />
      <circle cx="20" cy="24" r="3.2" fill="#000" />
      <circle cx="36" cy="24" r="3.2" fill="#000" />
      <path
        d="M19 35q9 7 18 0"
        stroke="#000"
        strokeWidth="2.8"
        fill="none"
        strokeLinecap="round"
      />
    </svg>
  )
}

export function Logo({ to = '/', light = false }: LogoProps) {
  return (
    <Link
      to={to}
      aria-label="Lead Factory"
      className={`inline-flex items-center gap-2 no-underline ${
        light ? 'text-white' : 'text-ink'
      }`}
    >
      <Mark />
      <span
        className={`text-[0.95rem] font-semibold tracking-tight ${
          light ? 'text-white' : 'text-ink'
        }`}
      >
        Lead Factory
      </span>
    </Link>
  )
}
