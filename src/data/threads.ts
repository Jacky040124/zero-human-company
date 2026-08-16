import { factory } from './factory'
import type { Lead, LeadStatus } from './leads'
import { nordlichtThread } from './thread'
import type { ThreadMessage } from './thread'

export function shortCompany(company: string): string {
  return company.split(/[\s&/]/)[0] ?? company
}

function firstName(buyer: string): string {
  return buyer.split(' ')[0] ?? buyer
}

function outboundLetter(lead: Lead): ThreadMessage {
  const name = firstName(lead.buyer)
  return {
    id: `${lead.id}-m1`,
    from: `Lead Factory · ${lead.worker}`,
    role: 'quay',
    time: '11 Aug · 09:18',
    body: `${name}, this is ${lead.worker} writing for ${factory.name} in Foshan. We manufacture ${lead.focus} for EU importers — FSC Mix, 1 × 40HQ MOQ, 35-day lead after deposit. Happy to send a spec pack and a current FOB Shenzhen range if you are still buying this season.`,
  }
}

function buyerReply(lead: Lead, time: string, idSuffix: string): ThreadMessage {
  return {
    id: `${lead.id}-${idSuffix}`,
    from: `${lead.buyer} · ${shortCompany(lead.company)}`,
    role: 'buyer',
    time,
    body: `Thanks for the note on ${lead.focus}. ${lead.lastAction}. Send whatever you have and I will circulate it here.`,
  }
}

function workerFollowUp(lead: Lead): ThreadMessage {
  return {
    id: `${lead.id}-m3`,
    from: `Lead Factory · ${lead.worker}`,
    role: 'quay',
    time: '13 Aug · 08:40',
    body: `Following up with a written quote for ${lead.containers}. We can hold the ${lead.focus} slot if you confirm this week. Inspection at the factory before loading is fine.`,
  }
}

function contractClose(lead: Lead): ThreadMessage {
  return {
    id: `${lead.id}-m4`,
    from: `${lead.buyer} · ${shortCompany(lead.company)}`,
    role: 'buyer',
    time: '14 Aug · 10:05',
    body: `Counsel has the draft. ${lead.lastAction}. I will send marks as soon as they land.`,
  }
}

export function makeThread(lead: Lead): ThreadMessage[] {
  if (lead.id === 'nordlicht' || lead.company.includes('Nordlicht')) return nordlichtThread

  const intro = outboundLetter(lead)
  if (lead.status === 'sourcing') return [intro]

  const reply = buyerReply(lead, '12 Aug · 15:22', 'm2')
  if (lead.status === 'contacted') return [intro, reply]

  const followUp = workerFollowUp(lead)
  if (lead.status === 'negotiating') return [intro, reply, followUp]

  return [intro, reply, followUp, contractClose(lead)]
}

const cannedByStatus: Record<LeadStatus, (lead: Lead) => string> = {
  sourcing: (lead) =>
    `Thanks for writing. We are reviewing ${lead.focus} suppliers this quarter and will come back if the spec fits.`,
  contacted: (lead) =>
    `Got it. Please send the latest ${lead.focus} spec and a 1 × 40HQ price. I will share it with the team.`,
  negotiating: (lead) =>
    `Noted. If the quote holds and inspection is at the factory, we can talk contract language this week. ${lead.focus} is still the priority.`,
  contract: () =>
    `Our counsel will mark the draft. I will send comments as soon as they land.`,
}

export function cannedBuyerReply(lead: Lead): string {
  if (lead.id === 'nordlicht') {
    return 'Noted. Our counsel will look at the redlined draft. If clause 5 is fixed the way your lawyer suggests, we can sign this week.'
  }
  return cannedByStatus[lead.status](lead)
}
