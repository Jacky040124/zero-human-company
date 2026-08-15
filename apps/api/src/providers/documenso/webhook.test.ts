import { describe, expect, it } from 'vitest'
import { parseDocumensoWebhook } from './webhook.js'

const secret = 'webhook-secret'
const expectedSigners = { ownerEmail: 'owner@example.com', buyerEmail: 'buyer@example.com' }

function body(event: string, recipients: unknown[], overrides: Record<string, unknown> = {}) {
  return {
    event,
    createdAt: '2026-08-15T10:00:00.000Z',
    payload: {
      id: 42,
      externalId: 'agreement-1',
      recipients,
      ...overrides,
    },
  }
}

const ownerSigned = {
  signingOrder: 1,
  signingStatus: 'SIGNED',
  signedAt: '2026-08-15T09:59:00.000Z',
  email: ' Owner@Example.com ',
}
const buyerUnsigned = {
  signingOrder: 2,
  signingStatus: 'NOT_SIGNED',
  email: 'buyer@example.com',
}
const buyerSigned = {
  ...buyerUnsigned,
  signingStatus: 'SIGNED',
  signedAt: '2026-08-15T10:01:00.000Z',
}

describe('parseDocumensoWebhook', () => {
  it('accepts an official single-recipient owner event without order or externalId', () => {
    const { signingOrder: _order, ...singleOwner } = ownerSigned
    const event = parseDocumensoWebhook({
      headers: { 'X-Documenso-Secret': secret },
      body: body('DOCUMENT_RECIPIENT_COMPLETED', [singleOwner], { externalId: undefined }),
    }, secret, expectedSigners)

    expect(event).toEqual({
      type: 'OWNER_SIGNED',
      sourceEventType: 'DOCUMENT_RECIPIENT_COMPLETED',
      documentId: '42',
      occurredAt: '2026-08-15T09:59:00.000Z',
    })
    expect(JSON.stringify(event)).not.toContain('@example.com')
    expect(JSON.stringify(event)).not.toContain(secret)
  })

  it('treats Documenso nullable externalId as absent', () => {
    const { signingOrder: _order, ...singleOwner } = ownerSigned
    expect(parseDocumensoWebhook({
      headers: { 'X-Documenso-Secret': secret },
      body: body('DOCUMENT_SIGNED', [singleOwner], { externalId: null }),
    }, secret, expectedSigners)).toEqual(expect.objectContaining({
      type: 'OWNER_SIGNED',
      documentId: '42',
    }))
  })

  it('keeps the two official owner notification types distinct for receipt deduplication', () => {
    const { signingOrder: _order, ...singleOwner } = ownerSigned
    const parse = (event: 'DOCUMENT_SIGNED' | 'DOCUMENT_RECIPIENT_COMPLETED') => parseDocumensoWebhook({
      headers: { 'X-Documenso-Secret': secret },
      body: body(event, [singleOwner], { externalId: undefined }),
    }, secret, expectedSigners)

    expect(parse('DOCUMENT_SIGNED')?.sourceEventType).toBe('DOCUMENT_SIGNED')
    expect(parse('DOCUMENT_RECIPIENT_COMPLETED')?.sourceEventType).toBe('DOCUMENT_RECIPIENT_COMPLETED')
  })

  it('prefers envelopeId, verifies owner-before-buyer completion, and uses buyer signedAt', () => {
    expect(parseDocumensoWebhook({
      headers: { 'x-documenso-secret': secret },
      body: body('DOCUMENT_COMPLETED', [ownerSigned, buyerSigned], {
        id: 'legacy-id',
        envelopeId: 'env_1',
        status: 'COMPLETED',
        documentMeta: { signingOrder: 'SEQUENTIAL' },
      }),
    }, secret, expectedSigners)).toEqual({
      type: 'DOCUMENT_COMPLETED',
      sourceEventType: 'DOCUMENT_COMPLETED',
      documentId: 'env_1',
      externalId: 'agreement-1',
      occurredAt: '2026-08-15T10:01:00.000Z',
    })
  })

  it('accepts completion when valid signing orders are omitted', () => {
    expect(parseDocumensoWebhook({
      headers: { 'x-documenso-secret': secret },
      body: body('DOCUMENT_COMPLETED', [
        { ...ownerSigned, signingOrder: undefined },
        { ...buyerSigned, signingOrder: undefined },
      ], { status: 'COMPLETED' }),
    }, secret, expectedSigners)?.type).toBe('DOCUMENT_COMPLETED')
  })

  it('supports the legacy Recipient payload key', () => {
    const inputBody = body('DOCUMENT_COMPLETED', [], { status: 'COMPLETED' })
    delete (inputBody.payload as { recipients?: unknown }).recipients
    ;(inputBody.payload as Record<string, unknown>).Recipient = [ownerSigned, buyerSigned]
    expect(parseDocumensoWebhook({
      headers: { 'x-documenso-secret': secret },
      body: inputBody,
    }, secret, expectedSigners)?.type).toBe('DOCUMENT_COMPLETED')
  })

  it('rejects completion for the wrong buyer identity without exposing either address', () => {
    const action = () => parseDocumensoWebhook({
      headers: { 'x-documenso-secret': secret },
      body: body('DOCUMENT_COMPLETED', [ownerSigned, { ...buyerSigned, email: 'attacker@example.com' }], { status: 'COMPLETED' }),
    }, secret, expectedSigners)
    expect(action).toThrow('invalid signer identity evidence')
    try {
      action()
    } catch (error) {
      expect(String(error)).not.toContain('buyer@example.com')
      expect(String(error)).not.toContain('attacker@example.com')
    }
  })

  it.each([
    ['wrong order', [{ ...ownerSigned, signingOrder: 2 }, { ...buyerSigned, signingOrder: 1 }]],
    ['parallel order', [ownerSigned, { ...buyerSigned, signingOrder: 1 }]],
    ['missing owner', [buyerSigned]],
  ])('rejects completion with %s signer evidence', (_name, recipients) => {
    expect(() => parseDocumensoWebhook({
      headers: { 'x-documenso-secret': secret },
      body: body('DOCUMENT_COMPLETED', recipients, { status: 'COMPLETED' }),
    }, secret, expectedSigners)).toThrow()
  })

  it('rejects completion evidence with an unexpected third recipient', () => {
    expect(() => parseDocumensoWebhook({
      headers: { 'x-documenso-secret': secret },
      body: body('DOCUMENT_COMPLETED', [
        ownerSigned,
        buyerSigned,
        { ...buyerSigned, email: 'observer@example.com', signingOrder: 3 },
      ], { status: 'COMPLETED' }),
    }, secret, expectedSigners)).toThrow('unexpected recipient evidence')
  })

  it('rejects buyer-only signing evidence for completion', () => {
    expect(() => parseDocumensoWebhook({
      headers: { 'x-documenso-secret': secret },
      body: body('DOCUMENT_COMPLETED', [{ ...ownerSigned, signingStatus: 'NOT_SIGNED', signedAt: undefined }, buyerSigned], { status: 'COMPLETED' }),
    }, secret, expectedSigners)).toThrow('invalid signer evidence')
  })

  it('ignores an owner event once the buyer has signed', () => {
    expect(parseDocumensoWebhook({
      headers: { 'x-documenso-secret': secret },
      body: body('DOCUMENT_RECIPIENT_COMPLETED', [ownerSigned, buyerSigned]),
    }, secret, expectedSigners)).toBeNull()
  })

  it('ignores an official single-recipient buyer event', () => {
    const { signingOrder: _order, ...singleBuyer } = buyerSigned
    expect(parseDocumensoWebhook({
      headers: { 'x-documenso-secret': secret },
      body: body('DOCUMENT_SIGNED', [singleBuyer], { externalId: undefined }),
    }, secret, expectedSigners)).toBeNull()
  })

  it('rejects an unrelated single-recipient signing event without exposing its email', () => {
    const action = () => parseDocumensoWebhook({
      headers: { 'x-documenso-secret': secret },
      body: body('DOCUMENT_SIGNED', [{
        ...ownerSigned,
        signingOrder: undefined,
        email: 'unrelated@example.com',
      }], { externalId: undefined }),
    }, secret, expectedSigners)
    expect(action).toThrow('invalid signer identity evidence')
    try {
      action()
    } catch (error) {
      expect(String(error)).not.toContain('unrelated@example.com')
    }
  })

  it.each([
    ['owner after buyer', '2026-08-15T10:02:00.000Z'],
    ['same signing time', buyerSigned.signedAt],
  ])('rejects completion with %s', (_name, ownerSignedAt) => {
    expect(() => parseDocumensoWebhook({
      headers: { 'x-documenso-secret': secret },
      body: body('DOCUMENT_COMPLETED', [
        { ...ownerSigned, signedAt: ownerSignedAt },
        buyerSigned,
      ], { status: 'COMPLETED' }),
    }, secret, expectedSigners)).toThrow('invalid signing sequence')
  })

  it('rejects completion explicitly marked with non-sequential document metadata', () => {
    expect(() => parseDocumensoWebhook({
      headers: { 'x-documenso-secret': secret },
      body: body('DOCUMENT_COMPLETED', [ownerSigned, buyerSigned], {
        status: 'COMPLETED',
        documentMeta: { signingOrder: 'PARALLEL' },
      }),
    }, secret, expectedSigners)).toThrow('not sequential')
  })

  it('rejects an owner event that does not identify the expected owner', () => {
    expect(() => parseDocumensoWebhook({
      headers: { 'x-documenso-secret': secret },
      body: body('DOCUMENT_RECIPIENT_COMPLETED', [
        { ...ownerSigned, email: 'other-owner@example.com' },
        buyerUnsigned,
      ]),
    }, secret, expectedSigners)).toThrow('invalid signer identity evidence')
  })

  it('fails closed for an invalid secret or incomplete completion event', () => {
    const input = {
      headers: { 'x-documenso-secret': 'wrong-secret' },
      body: {
        event: 'DOCUMENT_COMPLETED',
        createdAt: '2026-08-15T10:00:00.000Z',
        payload: { id: 42, externalId: 'agreement-1', status: 'COMPLETED' },
      },
    }
    expect(() => parseDocumensoWebhook(input, secret, expectedSigners)).toThrow('Invalid Documenso webhook signature')
    input.headers['x-documenso-secret'] = secret
    input.body.payload.status = 'PENDING'
    input.body.payload.recipients = [ownerSigned, buyerSigned]
    expect(() => parseDocumensoWebhook(input, secret, expectedSigners)).toThrow('not completed')
  })
})
