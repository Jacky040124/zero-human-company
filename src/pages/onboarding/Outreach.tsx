import { motion, useReducedMotion } from 'framer-motion'
import { OnboardingLayout } from './OnboardingLayout'

const EASE = [0.16, 1, 0.3, 1] as const

function TypingDots({ dotClass = 'bg-muted' }: { dotClass?: string }) {
  return (
    <span className="inline-flex items-center gap-0.5">
      {[0, 1, 2].map((index) => (
        <motion.span
          key={index}
          className={`h-1 w-1 rounded-full ${dotClass}`}
          animate={{ opacity: [0.25, 1, 0.25] }}
          transition={{ duration: 0.9, repeat: Infinity, delay: index * 0.16 }}
        />
      ))}
    </span>
  )
}

/* WhatsApp read ticks (double check, blue). */
function ReadTicks() {
  return (
    <span className="inline-flex text-[#53bdeb]" aria-hidden>
      <svg width="16" height="11" viewBox="0 0 16 11" fill="none">
        <path
          d="M1.5 6 4.5 9 10 2"
          stroke="currentColor"
          strokeWidth="1.4"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path
          d="M6.5 6 9.5 9 15 2"
          stroke="currentColor"
          strokeWidth="1.4"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </span>
  )
}

function EmailCard() {
  return (
    <article className="flex h-full flex-col overflow-hidden rounded-xl border border-black/8 bg-bg">
      <header className="flex items-center gap-2 border-b border-line bg-sidebar px-3 py-2">
        <h2 className="min-w-0 flex-1 truncate text-[0.8rem] font-semibold tracking-tight text-ink">
          FSC sofas from Foshan — 35-day lead
        </h2>
        <span className="shrink-0 rounded-sm bg-hover px-1.5 py-0.5 text-[0.55rem] font-medium text-muted">
          Inbox
        </span>
        <span className="shrink-0 text-[0.8rem] text-faint">☆</span>
      </header>

      <div className="flex items-center gap-2 px-3 pt-2.5">
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-mocha text-[0.62rem] font-semibold text-bg">
          LF
        </span>
        <span className="min-w-0 flex-1">
          <p className="truncate text-[0.75rem] leading-tight text-ink">
            <span className="font-semibold">Lead Factory</span>{' '}
            <span className="text-faint">&lt;outbound@leadfactory.run&gt;</span>
          </p>
          <p className="truncate text-[0.62rem] text-muted">
            to Anja Vogel &lt;anja@nordlicht.de&gt; ▾
          </p>
        </span>
        <time className="shrink-0 text-[0.62rem] text-faint">09:14</time>
      </div>

      <div className="flex-1 px-3 pt-2">
        <p className="text-[0.75rem] leading-snug text-ink">Hi Anja,</p>
        <p className="mt-1 line-clamp-3 text-[0.75rem] leading-snug text-ink">
          One more EU importer slot this quarter — Lingnan Sofa 04, FSC Mix,
          1×40HQ, 35 days from Foshan. Spec + fabric card attached.
        </p>
        <span className="mt-2 inline-flex items-center gap-1.5 rounded-md border border-line bg-sidebar px-2 py-1">
          <span className="flex h-4 w-4 items-center justify-center rounded-sm bg-danger text-[0.45rem] font-bold text-white">
            PDF
          </span>
          <span className="text-[0.62rem] text-ink">fabric-card.pdf</span>
          <span className="text-[0.58rem] text-faint">318 KB</span>
        </span>

        <div className="mt-2.5 flex items-center gap-1.5">
          <span className="rounded-full border border-line px-2.5 py-1 text-[0.62rem] text-muted">
            ↩ Reply
          </span>
          <span className="rounded-full border border-line px-2.5 py-1 text-[0.62rem] text-muted">
            ↪ Forward
          </span>
        </div>
      </div>

      <footer className="mt-auto flex h-8 items-center justify-between border-t border-line px-3">
        <span className="rounded-full bg-good-soft px-2 py-0.5 text-[0.62rem] font-medium text-good">
          ✓ Delivered · opened 2×
        </span>
        <span className="text-[0.62rem] text-faint">tracked by Lead Factory</span>
      </footer>
    </article>
  )
}

function WhatsAppCard() {
  return (
    <article className="flex h-full flex-col overflow-hidden rounded-xl border border-black/8">
      <header className="flex h-10 shrink-0 items-center gap-2 bg-[#f0f2f5] px-2.5">
        <span className="relative">
          <span className="flex h-7 w-7 items-center justify-center rounded-full bg-sky-wash text-[0.65rem] font-semibold text-bg">
            A
          </span>
          <span className="absolute right-0 bottom-0 h-2 w-2 rounded-full border-2 border-[#f0f2f5] bg-[#00a884]" />
        </span>
        <span className="min-w-0 flex-1">
          <p className="text-[0.8rem] font-semibold leading-none text-ink">Anja Vogel</p>
          <p className="mt-0.5 text-[0.62rem] text-[#00a884]">online</p>
        </span>
        <span className="text-[0.85rem] text-faint">⋮</span>
      </header>

      <div className="relative flex flex-1 flex-col justify-end gap-1.5 bg-[#e5ddd5] px-2.5 py-2">
        <svg
          className="pointer-events-none absolute inset-0 h-full w-full opacity-[0.06]"
          aria-hidden
        >
          <defs>
            <pattern id="wa-doodle" width="48" height="48" patternUnits="userSpaceOnUse">
              <path d="M12 10c4-4 8 4 12 0" stroke="#3d4f45" fill="none" strokeWidth="1" />
              <circle cx="36" cy="30" r="2.5" stroke="#3d4f45" fill="none" strokeWidth="1" />
              <path d="M8 36c2 3 6 3 8 0" stroke="#3d4f45" fill="none" strokeWidth="1" />
            </pattern>
          </defs>
          <rect width="100%" height="100%" fill="url(#wa-doodle)" />
        </svg>

        <div className="flex justify-end">
          <span className="relative max-w-[78%] rounded-[12px] rounded-br-[3px] bg-[#d9fdd3] px-2.5 pt-1.5 pb-1 shadow-[0_1px_0.5px_rgba(0,0,0,0.13)]">
            <span className="absolute -right-0.5 bottom-0 h-2 w-2 rotate-45 bg-[#d9fdd3]" />
            <p className="text-[0.75rem] leading-snug text-ink">
              Sample pair ships Friday 📦
            </p>
            <span className="mt-0.5 flex items-center justify-end gap-0.5">
              <time className="text-[0.58rem] text-[#667781]">09:14</time>
              <ReadTicks />
            </span>
          </span>
        </div>

        <div className="flex justify-start">
          <span className="relative max-w-[78%] rounded-[12px] rounded-bl-[3px] bg-bg px-2.5 pt-1.5 pb-1 shadow-[0_1px_0.5px_rgba(0,0,0,0.13)]">
            <span className="absolute -left-0.5 bottom-0 h-2 w-2 rotate-45 bg-bg" />
            <p className="text-[0.75rem] leading-snug text-ink">
              Perfect. Quality holds → we talk containers 👍
            </p>
            <span className="mt-0.5 flex justify-end">
              <time className="text-[0.58rem] text-[#667781]">09:21</time>
            </span>
          </span>
        </div>
      </div>

      <div className="flex h-8 shrink-0 items-center gap-1.5 bg-[#f0f2f5] px-2">
        <span className="text-[0.85rem]">😊</span>
        <span className="flex h-5 flex-1 items-center rounded-full bg-bg px-2.5 text-[0.62rem] text-faint">
          Message
        </span>
        <span className="text-[0.75rem] text-muted">🎤</span>
      </div>
    </article>
  )
}

function LinkedInCard() {
  return (
    <article className="flex h-full flex-col overflow-hidden rounded-xl border border-black/8 bg-bg">
      <header className="flex items-center gap-2 border-b border-line bg-sidebar px-3 py-2">
        <span className="flex h-5 w-5 items-center justify-center rounded-sm bg-[#0a66c2] text-[0.55rem] font-bold text-white">
          in
        </span>
        <span className="relative">
          <span className="flex h-8 w-8 items-center justify-center rounded-full bg-accent-soft text-[0.7rem] font-semibold text-accent">
            C
          </span>
          <span className="absolute right-0 bottom-0 h-2 w-2 rounded-full border-2 border-sidebar bg-[#057642]" />
        </span>
        <span className="min-w-0 flex-1">
          <p className="text-[0.8rem] font-semibold leading-tight text-ink">
            Camille <span className="font-normal text-muted">· 2nd</span>
          </p>
          <p className="truncate text-[0.62rem] text-muted">
            Interior Buyer · Atelier Loire
          </p>
        </span>
        <span className="rounded-sm bg-accent-soft px-1.5 py-0.5 text-[0.55rem] font-semibold uppercase tracking-wide text-accent">
          InMail
        </span>
      </header>

      <div className="flex flex-1 flex-col px-3 pt-2.5">
        <p className="text-center text-[0.58rem] font-medium uppercase tracking-wide text-faint">
          Tuesday
        </p>
        <p className="mt-1 text-center text-[0.62rem] text-muted">
          Camille accepted your invitation ✓
        </p>

        <div className="mt-2.5 ml-auto max-w-[88%] rounded-2xl rounded-br-md bg-accent-soft px-3 py-2">
          <p className="text-[0.75rem] leading-snug text-ink">
            Camille — Hengxin in Foshan. FSC Mix sofas, 35-day lead, 1×40HQ.
            Thought of Atelier Loire's hospitality book.
          </p>
        </div>

        <div className="mt-1.5 flex items-center justify-end gap-1">
          <span className="text-[0.62rem] text-faint">Seen</span>
          <span className="flex h-3.5 w-3.5 items-center justify-center rounded-full bg-accent-soft text-[0.4rem] font-semibold text-accent">
            C
          </span>
          <span className="text-[0.62rem] text-faint">Tue</span>
        </div>

        <div className="mt-auto flex items-center gap-1.5 pb-2">
          <span className="flex h-6 items-center gap-1 rounded-full bg-hover px-2">
            <TypingDots />
          </span>
          <span className="text-[0.62rem] text-muted">Camille is typing…</span>
        </div>
      </div>

      <div className="flex h-9 shrink-0 items-center gap-2 border-t border-line px-3">
        <span className="text-[0.8rem] text-muted">📎</span>
        <span className="flex h-6 flex-1 items-center rounded-full bg-hover px-2.5 text-[0.62rem] text-faint">
          Write a message…
        </span>
        <span className="text-[0.68rem] font-semibold text-[#0a66c2]">Send</span>
      </div>
    </article>
  )
}

function WeChatCard() {
  return (
    <article className="flex h-full flex-col overflow-hidden rounded-xl border border-black/8 bg-[#ededed]">
      <header className="relative flex h-9 shrink-0 items-center justify-center bg-[#ededed] px-2">
        <span className="absolute left-2 flex items-center gap-1 text-[1rem] text-ink">
          ‹
          <span className="flex h-4 min-w-4 items-center justify-center rounded-full bg-danger px-1 text-[0.6rem] font-medium text-white">
            1
          </span>
        </span>
        <p className="text-[0.8rem] font-medium text-ink">陈总</p>
        <span className="absolute right-2 text-[0.85rem] tracking-widest text-ink">···</span>
      </header>

      <div className="flex flex-1 flex-col justify-end gap-2.5 px-2 pt-2 pb-2">
        <time className="mx-auto rounded-sm bg-black/[0.18] px-2 py-0.5 text-[0.58rem] text-white">
          上午 10:02
        </time>

        <div className="flex items-start justify-end gap-1.5">
          <span className="relative max-w-[68%] rounded-[6px] bg-[#95ec69] px-2.5 py-1.5">
            <span className="absolute -right-1 top-2.5 h-2 w-2 rotate-45 bg-[#95ec69]" />
            <p className="text-[0.75rem] leading-snug text-ink">
              陈总好，岭南沙发 FSC 齐全，35 天交期 🤝
            </p>
          </span>
          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-[5px] bg-mocha text-[0.6rem] font-semibold text-bg">
            恒
          </span>
        </div>

        <div className="flex items-start justify-start gap-1.5">
          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-[5px] bg-peach text-[0.6rem] font-semibold text-graphite">
            陈
          </span>
          <span className="relative max-w-[68%] rounded-[6px] bg-bg px-2.5 py-1.5">
            <span className="absolute -left-1 top-2.5 h-2 w-2 rotate-45 bg-bg" />
            <p className="text-[0.75rem] leading-snug text-ink">发我产品册，量不是问题</p>
          </span>
        </div>
      </div>

      <div className="flex h-8 shrink-0 items-center gap-1.5 border-t border-black/5 bg-sidebar px-2">
        <span className="text-[0.62rem] text-ink">语音</span>
        <span className="h-5 flex-1 rounded-sm bg-bg" />
        <span className="text-[0.8rem]">😊</span>
        <span className="rounded-sm bg-[#95ec69] px-1.5 text-[0.62rem] text-ink">发送</span>
      </div>
    </article>
  )
}

export function Outreach() {
  const reduceMotion = Boolean(useReducedMotion())
  const cards = [
    <EmailCard key="email" />,
    <WhatsAppCard key="wa" />,
    <LinkedInCard key="li" />,
    <WeChatCard key="wx" />,
  ]

  return (
    <OnboardingLayout
      step={3}
      title="Wherever they read, that's where I write ✍️"
      nextTo="/onboarding/audience"
      nextLabel="Yes, talk like this →"
      bobbyExpression="happy"
    >
      <div className="grid min-h-[34rem] grid-cols-2 grid-rows-2 gap-3">
        {cards.map((card, index) => (
          <motion.div
            key={card.key}
            initial={reduceMotion ? false : { opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: index * 0.09, duration: 0.35, ease: EASE }}
            className="h-full min-h-0"
          >
            {card}
          </motion.div>
        ))}
      </div>
    </OnboardingLayout>
  )
}
