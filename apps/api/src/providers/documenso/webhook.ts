import { timingSafeEqual } from 'node:crypto'

export type DocumensoWebhookEvent = {
  type: 'OWNER_SIGNED' | 'DOCUMENT_COMPLETED'
  documentId: string
  externalId: string
  occurredAt: string
}

export type DocumensoWebhookInput = {
  headers: Record<string, string | string[] | undefined>
  body: unknown
}

export function parseDocumensoWebhook(
  input: DocumensoWebhookInput,
  webhookSecret: string,
): DocumensoWebhookEvent | null {
  if (!webhookSecret) throw new Error('Documenso webhook secret is required')
  const suppliedSecret = header(input.headers, 'x-documenso-secret')
  if (!suppliedSecret || !secretsEqual(suppliedSecret, webhookSecret)) {
    throw new Error('Invalid Documenso webhook signature')
  }
  if (!isRecord(input.body) || typeof input.body.event !== 'string' || !isRecord(input.body.payload)) {
    throw new Error('Invalid Documenso webhook body')
  }

  const { event, payload } = input.body
  const common = parseCommon(input.body, payload)
  if (event === 'DOCUMENT_COMPLETED') {
    if (payload.status !== 'COMPLETED') {
      throw new Error('Documenso completion event is not completed')
    }
    return { type: 'DOCUMENT_COMPLETED', ...common }
  }
  if (event !== 'DOCUMENT_SIGNED' && event !== 'DOCUMENT_RECIPIENT_COMPLETED') return null

  const recipients = payload.recipients ?? payload.Recipient
  if (!Array.isArray(recipients)) throw new Error('Documenso signing event is missing recipients')
  const owner = recipients
    .filter(isRecord)
    .find((recipient) => recipient.signingOrder === 1)
  const buyerAlreadySigned = recipients
    .filter(isRecord)
    .some((recipient) => recipient.signingOrder === 2 && recipient.signingStatus === 'SIGNED')
  if (!owner || buyerAlreadySigned || owner.signingStatus !== 'SIGNED' || typeof owner.signedAt !== 'string') {
    return null
  }
  return { type: 'OWNER_SIGNED', ...common, occurredAt: requireIsoDate(owner.signedAt, 'signedAt') }
}

function parseCommon(
  body: Record<string, unknown>,
  payload: Record<string, unknown>,
): Omit<DocumensoWebhookEvent, 'type'> {
  const id = payload.id ?? payload.envelopeId
  if ((typeof id !== 'string' && typeof id !== 'number') || !String(id)) {
    throw new Error('Documenso webhook is missing document id')
  }
  if (typeof payload.externalId !== 'string' || !payload.externalId) {
    throw new Error('Documenso webhook is missing externalId')
  }
  return {
    documentId: String(id),
    externalId: payload.externalId,
    occurredAt: requireIsoDate(body.createdAt, 'createdAt'),
  }
}

function requireIsoDate(value: unknown, name: string): string {
  if (typeof value !== 'string' || !value || !Number.isFinite(Date.parse(value))) {
    throw new Error(`Documenso webhook has invalid ${name}`)
  }
  return value
}

function header(headers: DocumensoWebhookInput['headers'], name: string): string | undefined {
  const found = Object.entries(headers).find(([key]) => key.toLowerCase() === name)
  const value = found?.[1]
  return Array.isArray(value) ? value[0] : value
}

function secretsEqual(left: string, right: string): boolean {
  const leftBytes = Buffer.from(left)
  const rightBytes = Buffer.from(right)
  return leftBytes.length === rightBytes.length && timingSafeEqual(leftBytes, rightBytes)
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
