import { useState } from 'react'
import { motion } from 'framer-motion'
import { Logo } from '../components/Logo'
import { requestMagicLink } from '../api/runtime'

type Phase = 'form' | 'sent'

export function Login() {
  const [phase, setPhase] = useState<Phase>('form')
  const [email, setEmail] = useState('')
  const [link, setLink] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [sending, setSending] = useState(false)

  const send = async () => {
    const trimmed = email.trim()
    if (!trimmed.includes('@')) {
      setError('Enter a valid email address.')
      return
    }
    setError(null)
    setSending(true)
    try {
      const result = await requestMagicLink(trimmed)
      setLink(result.link)
      setPhase('sent')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not create the sign-in link')
    } finally {
      setSending(false)
    }
  }

  return (
    <div className="flex min-h-svh flex-col bg-canvas">
      <header className="mx-auto flex w-full max-w-6xl items-center px-6 py-5">
        <Logo />
      </header>
      <main className="flex flex-1 items-center justify-center px-6 pb-24">
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.25 }}
          className="w-full max-w-sm rounded-xl border border-black/8 bg-bg p-6 shadow-[0_4px_12px_rgba(15,15,15,0.08)]"
        >
          {phase === 'form' ? (
            <>
              <h1 className="text-xl font-semibold tracking-tight text-ink">Sign in</h1>
              <p className="mt-1 text-sm text-muted">
                No password. We send a one-time sign-in link to your email.
              </p>
              <input
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') void send()
                }}
                placeholder="you@company.com"
                autoFocus
                className="mt-4 w-full rounded-lg border border-black/10 bg-bg px-3 py-2 text-sm text-ink outline-none placeholder:text-faint focus:border-accent"
              />
              <button
                type="button"
                disabled={sending}
                onClick={() => void send()}
                className={`mt-3 w-full cursor-pointer rounded-lg border-0 px-4 py-2.5 text-sm font-medium transition-colors ${
                  sending ? 'cursor-not-allowed bg-hover text-faint' : 'bg-accent text-white hover:bg-accent/90'
                }`}
              >
                {sending ? 'Sending…' : 'Email me a magic link'}
              </button>
              {error ? <p className="mt-3 text-sm text-warn">{error}</p> : null}
            </>
          ) : (
            <>
              <h1 className="text-xl font-semibold tracking-tight text-ink">Check your inbox 📬</h1>
              <p className="mt-1 text-sm text-muted">
                We sent a sign-in link to <span className="font-medium text-ink">{email.trim()}</span>.
              </p>
              <div className="mt-4 rounded-lg border border-dashed border-line bg-sidebar px-3 py-3">
                <p className="text-[0.65rem] font-semibold uppercase tracking-widest text-faint">
                  Demo inbox
                </p>
                <p className="mt-1 text-xs text-muted">
                  No mail server in this demo, so your link lands here instead.
                </p>
                {link ? (
                  <a
                    href={link}
                    className="mt-2 inline-block rounded-md bg-ink px-3 py-1.5 text-xs font-medium text-white no-underline hover:bg-ink/85"
                  >
                    Open magic link →
                  </a>
                ) : null}
              </div>
              <button
                type="button"
                onClick={() => {
                  setPhase('form')
                  setLink(null)
                }}
                className="mt-4 cursor-pointer border-0 bg-transparent p-0 text-xs text-muted hover:text-ink"
              >
                Use a different email
              </button>
            </>
          )}
        </motion.div>
      </main>
    </div>
  )
}
