import { getConfig } from '../config.js'

export type OutreachDraftInput = {
  company: string
  country?: string | null
  description?: string | null
  buyer?: string | null
  focus?: string | null
}

export type OutreachDraft = {
  contactName: string
  contactEmail: string
  subject: string
  body: string
}

const FACTORY_BRIEF = [
  'Sender: Lead Factory writing for Hengxin Home 恒信家具 in Nanhai, Foshan.',
  'Products: solid-wood dining, upholstered sofas, hotel casegoods.',
  'Terms: FSC Mix, BSCI, 1x40HQ MOQ, 35-day lead, FOB Shenzhen / CFR Hamburg.',
].join(' ')

function slugHost(company: string): string {
  return company.toLowerCase().replace(/[^a-z0-9]+/g, '').slice(0, 16) || 'buyer'
}

const PLACEHOLDER = /\[(?:your\s+)?name\]|\[insert[^\]]*\]|\byour name\b/gi

export function stripPlaceholders(text: string): string {
  return text
    .replace(PLACEHOLDER, '')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

function fallbackDraft(input: OutreachDraftInput): OutreachDraft {
  const company = input.company.trim() || 'the buyer'
  const host = slugHost(company)
  return {
    contactName: company,
    contactEmail: `sourcing@${host}.com`,
    subject: `FSC furniture from Foshan for ${company}`,
    body: [
      `Hello,`,
      ``,
      `I am writing from Lead Factory on behalf of Hengxin Home in Foshan. We make FSC Mix sofas, solid-wood dining, and hotel casegoods for EU importers — 1 × 40HQ MOQ, 35-day lead after deposit.`,
      ``,
      `If ${company} is still booking containers this season, I can send a spec pack and a current FOB Shenzhen range.`,
      ``,
      `Lead Factory`,
      `on behalf of Hengxin Home 恒信家具`,
    ].join('\n'),
  }
}

function finalizeBody(text: string): string {
  const cleaned = stripPlaceholders(text)
    .replace(/\n(?:best regards|kind regards|sincerely|thanks),?\s*$/i, '')
    .trim()
  if (!/lead factory/i.test(cleaned)) {
    return `${cleaned}\n\nLead Factory\non behalf of Hengxin Home 恒信家具`
  }
  return cleaned
}

function parseDraft(value: unknown, fallback: OutreachDraft): OutreachDraft {
  if (!value || typeof value !== 'object') return fallback
  const body = value as Record<string, unknown>
  const contactName = stripPlaceholders(typeof body.contactName === 'string' ? body.contactName : '')
  const contactEmail = stripPlaceholders(typeof body.contactEmail === 'string' ? body.contactEmail : '')
  const subject = stripPlaceholders(typeof body.subject === 'string' ? body.subject : '')
  const emailBody = finalizeBody(typeof body.body === 'string' ? body.body : '')
  if (contactName.length < 2 || !contactEmail.includes('@') || subject.length < 4 || emailBody.length < 40) {
    return fallback
  }
  if (/research only|your name|\[.*\]/i.test(`${contactName} ${emailBody}`)) return fallback
  return { contactName, contactEmail, subject, body: emailBody }
}

function extractJson(text: string): unknown {
  const trimmed = text.trim()
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/)
  const raw = fenced?.[1] ?? trimmed
  try {
    return JSON.parse(raw)
  } catch {
    const start = raw.indexOf('{')
    const end = raw.lastIndexOf('}')
    if (start < 0 || end <= start) return null
    try {
      return JSON.parse(raw.slice(start, end + 1))
    } catch {
      return null
    }
  }
}

export async function generateOutreachDraft(input: OutreachDraftInput): Promise<OutreachDraft> {
  const config = getConfig()
  const fallback = fallbackDraft(input)
  if (!config.OPENROUTER_API_KEY) return fallback

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 8_000)
  try {
    const response = await fetch(`${config.OPENROUTER_BASE_URL}/chat/completions`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${config.OPENROUTER_API_KEY}`,
        'content-type': 'application/json',
      },
      signal: controller.signal,
      body: JSON.stringify({
        model: config.OPENROUTER_EXTRACT_MODEL,
        temperature: 0.8,
        max_tokens: 280,
        messages: [
          {
            role: 'system',
            content: 'Write a short first-touch B2B email. Return JSON only with keys contactName, contactEmail, subject, body. contactName is the company, not a person. Sign only as Lead Factory on behalf of Hengxin Home. Never invent a sender name. Never use [Your Name], Your Name, placeholders, TBD, or Research only. 90-140 words. No markdown.',
          },
          {
            role: 'user',
            content: JSON.stringify({
              factory: FACTORY_BRIEF,
              company: input.company,
              country: input.country ?? 'Unknown',
              description: input.description ?? input.focus ?? '',
              buyer: input.buyer ?? '',
            }),
          },
        ],
      }),
    })
    if (!response.ok) return fallback
    const payload = await response.json() as {
      choices?: Array<{ message?: { content?: string | null } }>
    }
    return parseDraft(extractJson(payload.choices?.[0]?.message?.content ?? ''), fallback)
  } catch {
    return fallback
  } finally {
    clearTimeout(timer)
  }
}
