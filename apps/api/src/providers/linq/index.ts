import { createHash, createHmac, timingSafeEqual } from 'node:crypto'
import type {
  ProviderCapabilities,
  ProviderPort,
  ProviderRequest,
  ProviderResult,
} from '../types.js'
import {
  ProviderConfigurationError,
  ProviderOutcomeUnknownError,
  sanitizedExternalId,
} from '../types.js'

export type ConsentedRolePlayerRecipient = {
  address: string
  consented: true
  rolePlayerId: string
}

export type LinqSendRequest = {
  recipient: ConsentedRolePlayerRecipient
  text: string
}

export type LinqSendResult = {
  messageId: string
  chatId: string
  service: string | null
}

export type LinqConfig = {
  apiBaseUrl: string
  apiKey: string
  webhookSecret: string
}

type LinqApiResponse = {
  chat_id?: unknown
  service?: unknown
  trace_id?: unknown
  message?: { id?: unknown }
}

export class LinqMessageProvider implements ProviderPort<LinqSendRequest, LinqSendResult> {
  readonly provider = 'LINQ' as const

  constructor(
    private readonly config: LinqConfig,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  capabilities(): ProviderCapabilities {
    return { live: true, idempotency: 'native', operations: ['message.send'] }
  }

  async preflight(): Promise<void> {
    const missing = Object.entries(this.config)
      .filter(([, value]) => !value)
      .map(([key]) => key)
    if (missing.length) throw new ProviderConfigurationError(this.provider, missing)
    const baseUrl = new URL(this.config.apiBaseUrl)
    if (baseUrl.protocol !== 'https:') {
      throw new ProviderConfigurationError(this.provider, ['apiBaseUrl (must use https)'])
    }
  }

  async execute(request: ProviderRequest<LinqSendRequest>): Promise<ProviderResult<LinqSendResult>> {
    await this.preflight()
    const { recipient, text } = request.payload
    if (recipient?.consented !== true || !recipient.address || !recipient.rolePlayerId) {
      throw new Error('Linq sends require one explicitly consented role-player recipient')
    }
    if (!text.trim() || !request.idempotencyKey) {
      throw new Error('Linq sends require message text and an idempotency key')
    }

    const endpoint = new URL(
      `${this.config.apiBaseUrl.replace(/\/$/, '')}/v3/messages`,
    )
    let response: Response
    try {
      response = await this.fetchImpl(endpoint, {
        method: 'POST',
        headers: {
          authorization: `Bearer ${this.config.apiKey}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          to: [recipient.address],
          message: {
            parts: [{ type: 'text', value: text }],
            idempotency_key: request.idempotencyKey,
          },
        }),
      })
    } catch {
      throw new ProviderOutcomeUnknownError(
        'Linq send outcome is unknown; reconcile or retry only with the same idempotency key',
        request.idempotencyKey,
      )
    }

    const body = (await response.json().catch(() => ({}))) as LinqApiResponse & {
      message?: LinqApiResponse['message'] | string
      error?: unknown
    }
    if (!response.ok) {
      if (response.status >= 500 || response.status === 429) {
        throw new ProviderOutcomeUnknownError(
          `Linq send returned ${response.status}; outcome requires reconciliation`,
          typeof body.trace_id === 'string' ? body.trace_id : request.idempotencyKey,
        )
      }
      throw new Error(`Linq rejected the send with status ${response.status}`)
    }

    const messageId =
      typeof body.message === 'object' && body.message !== null && typeof body.message.id === 'string'
        ? body.message.id
        : null
    const chatId = typeof body.chat_id === 'string' ? body.chat_id : null
    if (!messageId || !chatId) {
      throw new ProviderOutcomeUnknownError(
        'Linq accepted the request but returned no stable message identifier',
        typeof body.trace_id === 'string' ? body.trace_id : request.idempotencyKey,
      )
    }

    const service = typeof body.service === 'string' ? body.service : null
    const externalId = sanitizedExternalId(this.provider, messageId)
    const data = { messageId, chatId, service }
    return {
      provider: this.provider,
      externalId,
      live: true,
      status: 'ACCEPTED',
      data,
      redacted: {
        externalId,
        rolePlayerId: recipient.rolePlayerId,
        recipientFingerprint: fingerprintLinqAddress(recipient.address),
        chatId,
        service,
      },
    }
  }
}

export type LinqWebhookHeaders = {
  'webhook-id'?: string
  'webhook-timestamp'?: string
  'webhook-signature'?: string
  [name: string]: string | undefined
}

export type VerifiedLinqWebhook = {
  eventId: string
  eventType: string
  createdAt: string | null
  messageId: string | null
  chatId: string | null
  text: string | null
  senderFingerprint: string | null
  optedOut: boolean
}

export function verifyLinqWebhook(
  rawBody: Buffer | string,
  headers: LinqWebhookHeaders,
  webhookSecret: string,
  nowMs = Date.now(),
): VerifiedLinqWebhook {
  const eventId = header(headers, 'webhook-id')
  const timestamp = header(headers, 'webhook-timestamp')
  const signatures = header(headers, 'webhook-signature')
  if (!eventId || !timestamp || !signatures) throw new Error('Missing Linq webhook headers')

  const timestampSeconds = Number(timestamp)
  if (!Number.isInteger(timestampSeconds) || Math.abs(nowMs / 1000 - timestampSeconds) > 300) {
    throw new Error('Linq webhook timestamp is outside the allowed five-minute window')
  }

  const bodyBuffer = Buffer.isBuffer(rawBody) ? rawBody : Buffer.from(rawBody)
  const secret = webhookSecret.startsWith('whsec_') ? webhookSecret.slice(6) : webhookSecret
  const key = Buffer.from(secret, 'base64')
  if (!key.length) throw new Error('Invalid Linq webhook secret')
  const signed = Buffer.concat([
    Buffer.from(`${eventId}.${timestamp}.`),
    bodyBuffer,
  ])
  const expected = createHmac('sha256', key).update(signed).digest()
  const valid = signatures.split(' ').some((candidate) => {
    if (!candidate.startsWith('v1,')) return false
    const actual = Buffer.from(candidate.slice(3), 'base64')
    return actual.length === expected.length && timingSafeEqual(actual, expected)
  })
  if (!valid) throw new Error('Invalid Linq webhook signature')

  const envelope = JSON.parse(bodyBuffer.toString('utf8')) as Record<string, unknown>
  if (envelope.event_id !== eventId || typeof envelope.event_type !== 'string') {
    throw new Error('Linq webhook event id or type is invalid')
  }
  const data = record(envelope.data)
  const parts = Array.isArray(data?.parts) ? data.parts : []
  const textParts = parts
    .map(record)
    .filter((part) => part?.type === 'text' && typeof part.value === 'string')
    .map((part) => part!.value as string)
  const text = textParts.length ? textParts.join('\n') : null
  const sender = record(data?.sender_handle)?.handle ?? data?.from

  return {
    eventId,
    eventType: envelope.event_type,
    createdAt: typeof envelope.created_at === 'string' ? envelope.created_at : null,
    messageId: typeof data?.id === 'string' ? data.id : null,
    chatId:
      typeof record(data?.chat)?.id === 'string'
        ? (record(data?.chat)!.id as string)
        : typeof data?.chat_id === 'string'
          ? data.chat_id
          : null,
    text,
    senderFingerprint: typeof sender === 'string' ? fingerprintLinqAddress(sender) : null,
    optedOut: envelope.event_type === 'message.received' && text !== null && isOptOutMessage(text),
  }
}

export function isOptOutMessage(text: string): boolean {
  const normalized = text.trim()
  if (/^(stop|unsubscribe|opt[ -]?out|cancel|end|quit)$/i.test(normalized)) return true
  return /\b(stop|quit|cease)\b.{0,24}\b(message|messaging|contact|text|texting)\b/i.test(normalized)
}

export function fingerprintLinqAddress(value: string): string {
  return createHash('sha256').update(value).digest('hex').slice(0, 16)
}

export function parseMaasSeatPrice(text: string): number | null {
  const normalized = text.replace(/,/g, '').replace(/\s+/g, ' ').trim()
  const patterns = [
    /(?:€|eur\s*)(\d+(?:\.\d{1,2})?)\s*(?:\/|per\s+)?seat\b/i,
    /\b(\d+(?:\.\d{1,2})?)\s*(?:€|eur)\s*(?:\/|per\s+)?seat\b/i,
    /(?:€|eur\s*)(\d+(?:\.\d{1,2})?)\b/i,
    /\b(\d+(?:\.\d{1,2})?)\s*(?:€|eur)\b/i,
  ]
  for (const pattern of patterns) {
    const match = normalized.match(pattern)
    if (!match) continue
    const price = Number(match[1])
    if (Number.isFinite(price) && price > 0) return price
  }
  return null
}

export function isExplicitAcceptance(text: string): boolean {
  const normalized = text.trim().replace(/\s+/g, ' ')
  if (!normalized || /\b(?:not|don't|do not|cannot|can't|won't|wouldn't)\s+(?:accept|agree)\b/i.test(normalized)) {
    return false
  }
  if (/\b(?:if|provided that|subject to|assuming)\b/i.test(normalized)) return false
  return /^(?:yes[,! ]+)?(?:i|we)\s+(?:accept|agree)(?:\s+(?:to\s+)?(?:the|these|your)\s+terms)?[.!]?$/i.test(normalized)
    || /^(?:accepted|agreed|deal)[.!]?$/i.test(normalized)
}

function record(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null
}

function header(headers: LinqWebhookHeaders, name: string): string | undefined {
  const match = Object.entries(headers).find(([key]) => key.toLowerCase() === name)
  return match?.[1]
}
