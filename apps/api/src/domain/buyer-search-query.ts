import { getConfig } from '../config.js'

// Apollo q_organization_keyword_tags[] matches short plain tags. Boolean
// operators, sentences, or field syntax match nothing, so queries here must
// stay to a 1-3 word phrase.
const ANGLES = [
  'furniture wholesale',
  'furniture distributor',
  'home furnishings',
  'sofa importer',
  'furniture trading',
  'hotel furniture',
  'interior furnishings',
  'furniture retail',
] as const

export function pickSearchAngle(random = Math.random): string {
  return ANGLES[Math.floor(random() * ANGLES.length)] ?? ANGLES[0]
}

export function fallbackBuyerSearchQuery(_region: string, angle: string): string {
  return angle
}

const BANNED = /\b(?:and|or|not)\b|[()[\]{}<>:"=|]/i

export function cleanKeywordQuery(value: string): string | null {
  const query = value
    .replace(/^["'\s]+|["'\s.]+$/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase()
  if (query.length < 4 || query.length > 40) return null
  if (BANNED.test(query)) return null
  if (query.split(' ').length > 3) return null
  return query
}

export async function generateBuyerSearchQuery(input: {
  region: string
  buyerType?: string
}): Promise<string> {
  const config = getConfig()
  const region = input.region.trim() || 'Europe'
  const buyerType = input.buyerType?.trim() || 'importer'
  const angle = pickSearchAngle()
  const fallback = fallbackBuyerSearchQuery(region, angle)
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
        temperature: 0.9,
        max_tokens: 12,
        messages: [
          {
            role: 'system',
            content: 'Output one Apollo organization keyword tag: a plain 1-3 word phrase, lowercase, no boolean operators, no punctuation, no quotes. Nothing else.',
          },
          {
            role: 'user',
            content: `A Foshan furniture factory (sofas, dining, hotel casegoods) wants ${region} ${buyerType} buyers. Example tag: "${angle}". Give one different 1-3 word keyword tag describing that kind of company.`,
          },
        ],
      }),
    })
    if (!response.ok) return fallback
    const body = await response.json() as {
      choices?: Array<{ message?: { content?: string | null } }>
    }
    return cleanKeywordQuery(body.choices?.[0]?.message?.content ?? '') ?? fallback
  } catch {
    return fallback
  } finally {
    clearTimeout(timer)
  }
}
