import { timingSafeEqual } from 'node:crypto'

export type DocumensoWebhookEvent = {
  type: 'OWNER_SIGNED' | 'DOCUMENT_COMPLETED'
  sourceEventType: 'DOCUMENT_SIGNED' | 'DOCUMENT_RECIPIENT_COMPLETED' | 'DOCUMENT_COMPLETED'
  documentId: string
  externalId?: string
  occurredAt: string
}

export type DocumensoWebhookInput = {
  headers: Record<string, string | string[] | undefined>
  body: unknown
}

export type DocumensoExpectedSigners = {
  ownerEmail: string
  buyerEmail: string
}

export function parseDocumensoWebhook(
  input: DocumensoWebhookInput,
  webhookSecret: string,
  expectedSigners: DocumensoExpectedSigners,
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
    requireSequentialDocument(payload)
    const recipients = parseExpectedRecipients(payload, expectedSigners)
    requireSigningOrder(recipients.owner, 1)
    requireSigningOrder(recipients.buyer, 2)
    if (!isSigned(recipients.owner) || !isSigned(recipients.buyer)) {
      throw new Error('Documenso completion event has invalid signer evidence')
    }
    const ownerSignedAt = Date.parse(requireIsoDate(recipients.owner.signedAt, 'owner signedAt'))
    const buyerSignedAt = Date.parse(requireIsoDate(recipients.buyer.signedAt, 'buyer signedAt'))
    if (ownerSignedAt >= buyerSignedAt) {
      throw new Error('Documenso completion event has invalid signing sequence')
    }
    return {
      type: 'DOCUMENT_COMPLETED',
      sourceEventType: event,
      ...common,
      occurredAt: requireIsoDate(recipients.buyer.signedAt, 'buyer signedAt'),
    }
  }
  if (event !== 'DOCUMENT_SIGNED' && event !== 'DOCUMENT_RECIPIENT_COMPLETED') return null

  const values = parseRecipientList(payload, expectedSigners)
  if (values.length === 1) {
    const recipient = values[0]
    if (!recipient) throw new Error('Documenso signing event has invalid recipient evidence')
    if (emailsEqual(recipient.email, expectedSigners.ownerEmail)) {
      requireSigningOrder(recipient, 1)
      if (!isSigned(recipient)) return null
      return {
        type: 'OWNER_SIGNED',
        sourceEventType: event,
        ...common,
        occurredAt: requireIsoDate(recipient.signedAt, 'owner signedAt'),
      }
    }
    if (emailsEqual(recipient.email, expectedSigners.buyerEmail)) {
      requireSigningOrder(recipient, 2)
      return null
    }
    throw new Error('Documenso signing event has invalid signer identity evidence')
  }

  const recipients = expectedRecipients(values, expectedSigners)
  requireSigningOrder(recipients.owner, 1)
  requireSigningOrder(recipients.buyer, 2)
  if (!isSigned(recipients.owner) || !isUnsigned(recipients.buyer)) {
    return null
  }
  return {
    type: 'OWNER_SIGNED',
    sourceEventType: event,
    ...common,
    occurredAt: requireIsoDate(recipients.owner.signedAt, 'owner signedAt'),
  }
}

type Recipient = Record<string, unknown> & {
  email: string
  signingOrder?: number
  signingStatus: string
}

function parseExpectedRecipients(
  payload: Record<string, unknown>,
  expected: DocumensoExpectedSigners,
): { owner: Recipient; buyer: Recipient } {
  return expectedRecipients(parseRecipientList(payload, expected), expected)
}

function parseRecipientList(
  payload: Record<string, unknown>,
  expected: DocumensoExpectedSigners,
): Recipient[] {
  if (!expected.ownerEmail || !expected.buyerEmail || emailsEqual(expected.ownerEmail, expected.buyerEmail)) {
    throw new Error('Documenso expected signer configuration is invalid')
  }
  const value = payload.recipients ?? payload.Recipient
  if (!Array.isArray(value)) throw new Error('Documenso signing event is missing recipients')
  const recipients = value.filter(isRecipient)
  if (recipients.length !== value.length) {
    throw new Error('Documenso signing event has invalid recipient evidence')
  }
  return recipients
}

function expectedRecipients(
  recipients: Recipient[],
  expected: DocumensoExpectedSigners,
): { owner: Recipient; buyer: Recipient } {
  if (recipients.length !== 2) {
    throw new Error('Documenso signing event has unexpected recipient evidence')
  }
  const owners = recipients.filter((recipient) => emailsEqual(recipient.email, expected.ownerEmail))
  const buyers = recipients.filter((recipient) => emailsEqual(recipient.email, expected.buyerEmail))
  if (owners.length !== 1 || buyers.length !== 1) {
    throw new Error('Documenso signing event has invalid signer identity evidence')
  }
  const owner = owners[0]
  const buyer = buyers[0]
  if (!owner || !buyer) throw new Error('Documenso signing event has invalid signer identity evidence')
  return { owner, buyer }
}

function isRecipient(value: unknown): value is Recipient {
  return isRecord(value)
    && typeof value.email === 'string'
    && (value.signingOrder === undefined
      || (typeof value.signingOrder === 'number' && Number.isInteger(value.signingOrder)))
    && typeof value.signingStatus === 'string'
}

function requireSigningOrder(recipient: Recipient, expectedOrder: 1 | 2): void {
  if (recipient.signingOrder !== undefined && recipient.signingOrder !== expectedOrder) {
    throw new Error('Documenso signing event has invalid signing order')
  }
}

function requireSequentialDocument(payload: Record<string, unknown>): void {
  if (payload.documentMeta === undefined) return
  if (!isRecord(payload.documentMeta) || payload.documentMeta.signingOrder !== 'SEQUENTIAL') {
    throw new Error('Documenso completion event is not sequential')
  }
}

function isSigned(recipient: Recipient): boolean {
  return recipient.signingStatus === 'SIGNED'
    && typeof recipient.signedAt === 'string'
    && recipient.signedAt.length > 0
    && Number.isFinite(Date.parse(recipient.signedAt))
}

function isUnsigned(recipient: Recipient): boolean {
  return recipient.signingStatus === 'NOT_SIGNED'
    && (recipient.signedAt === undefined || recipient.signedAt === null)
}

function emailsEqual(left: string, right: string): boolean {
  const leftBytes = Buffer.from(normalizeEmail(left))
  const rightBytes = Buffer.from(normalizeEmail(right))
  return leftBytes.length === rightBytes.length && timingSafeEqual(leftBytes, rightBytes)
}

function normalizeEmail(value: string): string {
  return value.trim().normalize('NFC').toLowerCase()
}

function parseCommon(
  body: Record<string, unknown>,
  payload: Record<string, unknown>,
): Pick<DocumensoWebhookEvent, 'documentId' | 'externalId' | 'occurredAt'> {
  const id = payload.envelopeId ?? payload.id
  if ((typeof id !== 'string' && typeof id !== 'number') || !String(id)) {
    throw new Error('Documenso webhook is missing document id')
  }
  if (payload.externalId !== undefined && payload.externalId !== null && (typeof payload.externalId !== 'string' || !payload.externalId)) {
    throw new Error('Documenso webhook has invalid externalId')
  }
  return {
    documentId: String(id),
    ...(typeof payload.externalId === 'string' ? { externalId: payload.externalId } : {}),
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
