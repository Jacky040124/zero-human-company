export const outreachEmail = {
  subject: 'FSC sofas from Foshan — 35-day lead',
  from: 'Lead Factory for Hengxin Home <outbound@leadfactory.run>',
  preview: 'Lingnan Sofa 04. FSC Mix. One container. Thirty-five days.',
  body: `Hi Anja,

Lingnan Sofa 04 is open for one more EU importer this quarter — FSC Mix, 1×40HQ, 35-day lead from Foshan.

Spec and fabric card on request.

Lead Factory
on behalf of Hengxin Home 恒信家具`,
}

export type OutreachChannelId = 'email' | 'whatsapp' | 'linkedin' | 'wechat'

export type OutreachMessage = {
  id: string
  from: 'quay' | 'buyer'
  name: string
  body: string
  time: string
}

export type OutreachChannel = {
  id: OutreachChannelId
  label: string
  peer: string
  meta: string
  messages: OutreachMessage[]
}

export type OutreachScene = {
  id: OutreachChannelId
  header: string
  headerClass: string
  subject?: string
  body?: string
  footer?: string
  footerClass?: string
  messages?: Array<{ id: string; from: 'quay' | 'buyer'; body: string }>
  typing?: boolean
  skin: 'email' | 'whatsapp' | 'linkedin' | 'wechat'
}

export const outreachChannels: OutreachChannel[] = [
  {
    id: 'email',
    label: 'Email',
    peer: 'Anja Vogel',
    meta: 'anja@nordlicht.de',
    messages: [],
  },
  {
    id: 'whatsapp',
    label: 'WhatsApp',
    peer: 'Anja Vogel',
    meta: 'online',
    messages: [
      {
        id: 'wa-1',
        from: 'quay',
        name: 'Lead Factory',
        time: '09:14',
        body: 'Sample pair ships Friday 📦',
      },
      {
        id: 'wa-2',
        from: 'buyer',
        name: 'Anja',
        time: '09:21',
        body: 'Perfect. Quality holds → we talk containers 👍',
      },
    ],
  },
  {
    id: 'linkedin',
    label: 'LinkedIn',
    peer: 'Camille',
    meta: 'Atelier Loire',
    messages: [
      {
        id: 'li-1',
        from: 'quay',
        name: 'Lead Factory · Hengxin Home',
        time: 'Tue',
        body: 'Camille — Hengxin in Foshan. FSC Mix sofas, 35-day lead, 1×40HQ. Thought of Atelier Loire’s hospitality book.',
      },
    ],
  },
  {
    id: 'wechat',
    label: 'WeChat',
    peer: 'Leo Chen',
    meta: '采购代理',
    messages: [
      {
        id: 'wx-1',
        from: 'quay',
        name: '恒信 · Lead Factory',
        time: '10:02',
        body: '陈总好，岭南沙发 FSC 齐全，35 天交期 🤝',
      },
      {
        id: 'wx-2',
        from: 'buyer',
        name: 'Leo',
        time: '10:08',
        body: '发我产品册，量不是问题',
      },
    ],
  },
]

export const outreachScenes: OutreachScene[] = [
  {
    id: 'email',
    skin: 'email',
    header: '✉ EMAIL · anja@nordlicht.de',
    headerClass: 'text-muted',
    subject: 'FSC sofas from Foshan — 35-day lead',
    body: 'Anja — one more EU importer slot this quarter. Lingnan Sofa 04, FSC Mix, 1×40HQ, 35 days from Foshan. Spec + fabric card ready.',
    footer: '✓ Delivered · opened 2×',
    footerClass: 'text-good',
  },
  {
    id: 'whatsapp',
    skin: 'whatsapp',
    header: 'WhatsApp · Anja',
    headerClass: 'text-good',
    messages: [
      { id: 'wa-1', from: 'quay', body: 'Sample pair ships Friday 📦 ✓✓' },
      { id: 'wa-2', from: 'buyer', body: 'Perfect. Quality holds → we talk containers 👍' },
    ],
  },
  {
    id: 'linkedin',
    skin: 'linkedin',
    header: 'in LINKEDIN · Camille, Atelier Loire',
    headerClass: 'text-accent',
    body: 'Camille — Hengxin in Foshan. FSC Mix sofas, 35-day lead, 1×40HQ. Thought of Atelier Loire’s hospitality book.',
    footer: 'Seen · typing…',
    typing: true,
  },
  {
    id: 'wechat',
    skin: 'wechat',
    header: '🟢 WECHAT · 采购代理 Leo Chen',
    headerClass: 'text-graphite',
    messages: [
      { id: 'wx-1', from: 'quay', body: '陈总好，岭南沙发 FSC 齐全，35 天交期 🤝' },
      { id: 'wx-2', from: 'buyer', body: '发我产品册，量不是问题' },
    ],
  },
]
