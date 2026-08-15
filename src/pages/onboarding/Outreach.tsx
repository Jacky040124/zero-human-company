import { motion } from 'framer-motion'
import { outreachScenes } from '../../data'
import type { OutreachScene } from '../../data'
import { OnboardingLayout } from './OnboardingLayout'

function TypingDots() {
  return (
    <span className="ml-1 inline-flex items-center gap-0.5">
      {[0, 1, 2].map((index) => (
        <motion.span
          key={index}
          className="h-1 w-1 rounded-full bg-muted"
          animate={{ opacity: [0.25, 1, 0.25] }}
          transition={{ duration: 0.9, repeat: Infinity, delay: index * 0.16 }}
        />
      ))}
    </span>
  )
}

function EmailCard({ scene }: { scene: OutreachScene }) {
  return (
    <article className="flex h-full flex-col rounded-xl border border-black/8 bg-bg p-4">
      <p className={`text-[0.7rem] font-medium ${scene.headerClass}`}>{scene.header}</p>
      <h2 className="mt-3 text-sm font-semibold tracking-tight text-ink">{scene.subject}</h2>
      <p className="mt-2 flex-1 text-sm leading-relaxed text-ink">{scene.body}</p>
      <p className={`mt-3 text-[0.7rem] font-medium ${scene.footerClass ?? 'text-muted'}`}>
        {scene.footer}
      </p>
    </article>
  )
}

function WhatsAppCard({ scene }: { scene: OutreachScene }) {
  return (
    <article className="flex h-full flex-col rounded-xl border border-black/8 bg-[#f3f8f4] p-4">
      <p className={`text-[0.7rem] font-medium ${scene.headerClass}`}>{scene.header}</p>
      <div className="mt-3 flex flex-1 flex-col justify-end gap-2">
        {scene.messages?.map((message) => {
          const mine = message.from === 'quay'
          return (
            <div key={message.id} className={`flex ${mine ? 'justify-end' : 'justify-start'}`}>
              <p
                className={`max-w-[90%] px-3 py-2 text-sm leading-relaxed text-ink ${
                  mine
                    ? 'rounded-xl rounded-br-sm bg-good-soft'
                    : 'rounded-xl rounded-bl-sm border border-line bg-bg'
                }`}
              >
                {message.body}
              </p>
            </div>
          )
        })}
      </div>
    </article>
  )
}

function LinkedInCard({ scene }: { scene: OutreachScene }) {
  return (
    <article className="flex h-full flex-col rounded-xl border border-black/8 bg-bg p-4">
      <p className={`text-[0.7rem] font-medium ${scene.headerClass}`}>{scene.header}</p>
      <p className="mt-3 flex-1 text-sm leading-relaxed text-ink">{scene.body}</p>
      <p className="mt-3 text-[0.7rem] text-muted">
        {scene.footer}
        {scene.typing && <TypingDots />}
      </p>
    </article>
  )
}

function WeChatCard({ scene }: { scene: OutreachScene }) {
  return (
    <article className="flex h-full flex-col rounded-xl border border-black/8 bg-[#faf6f1] p-4">
      <p className={`text-[0.7rem] font-medium ${scene.headerClass}`}>{scene.header}</p>
      <div className="mt-3 flex flex-1 flex-col justify-end gap-2">
        {scene.messages?.map((message) => {
          const mine = message.from === 'quay'
          return (
            <div key={message.id} className={`flex ${mine ? 'justify-end' : 'justify-start'}`}>
              <p
                className={`max-w-[90%] rounded-xl px-3 py-2 text-sm leading-relaxed text-ink ${
                  mine ? 'rounded-br-sm bg-[#dcf1d0]' : 'rounded-bl-sm border border-line bg-bg'
                }`}
              >
                {message.body}
              </p>
            </div>
          )
        })}
      </div>
    </article>
  )
}

function SceneCard({ scene, index }: { scene: OutreachScene; index: number }) {
  const inner =
    scene.skin === 'email' ? (
      <EmailCard scene={scene} />
    ) : scene.skin === 'whatsapp' ? (
      <WhatsAppCard scene={scene} />
    ) : scene.skin === 'linkedin' ? (
      <LinkedInCard scene={scene} />
    ) : (
      <WeChatCard scene={scene} />
    )

  return (
    <motion.div
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.09, duration: 0.35 }}
      className="h-full min-h-0"
    >
      {inner}
    </motion.div>
  )
}

export function Outreach() {
  return (
    <OnboardingLayout
      step={3}
      title="Wherever they read, that's where I write ✍️"
      nextTo="/onboarding/audience"
      nextLabel="Yes, talk like this →"
      bobbyExpression="happy"
    >
      <div className="grid min-h-[28rem] grid-cols-2 grid-rows-2 gap-3">
        {outreachScenes.map((scene, index) => (
          <SceneCard key={scene.id} scene={scene} index={index} />
        ))}
      </div>
    </OnboardingLayout>
  )
}
