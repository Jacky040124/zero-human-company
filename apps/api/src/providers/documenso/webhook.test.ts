import { describe, expect, it } from 'vitest'
import { parseDocumensoWebhook } from './webhook.js'

const secret = 'webhook-secret'

describe('parseDocumensoWebhook', () => {
  it('verifies and parses the owner signer completion without returning email or secret', () => {
    const event = parseDocumensoWebhook({
      headers: { 'X-Documenso-Secret': secret },
      body: {
        event: 'DOCUMENT_RECIPIENT_COMPLETED',
        createdAt: '2026-08-15T10:00:00.000Z',
        payload: {
          id: 42,
          externalId: 'agreement-1',
          recipients: [
            {
              signingOrder: 1,
              signingStatus: 'SIGNED',
              signedAt: '2026-08-15T09:59:00.000Z',
              email: 'owner@example.com',
            },
            { signingOrder: 2, signingStatus: 'NOT_SIGNED', email: 'buyer@example.com' },
          ],
        },
      },
    }, secret)

    expect(event).toEqual({
      type: 'OWNER_SIGNED',
      documentId: '42',
      externalId: 'agreement-1',
      occurredAt: '2026-08-15T09:59:00.000Z',
    })
    expect(JSON.stringify(event)).not.toContain('@example.com')
    expect(JSON.stringify(event)).not.toContain(secret)
  })

  it('verifies and parses document completion', () => {
    expect(parseDocumensoWebhook({
      headers: { 'x-documenso-secret': secret },
      body: {
        event: 'DOCUMENT_COMPLETED',
        createdAt: '2026-08-15T10:00:00.000Z',
        payload: { id: 'env_1', externalId: 'agreement-1', status: 'COMPLETED' },
      },
    }, secret)).toEqual({
      type: 'DOCUMENT_COMPLETED',
      documentId: 'env_1',
      externalId: 'agreement-1',
      occurredAt: '2026-08-15T10:00:00.000Z',
    })
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
    expect(() => parseDocumensoWebhook(input, secret)).toThrow('Invalid Documenso webhook signature')
    input.headers['x-documenso-secret'] = secret
    input.body.payload.status = 'PENDING'
    expect(() => parseDocumensoWebhook(input, secret)).toThrow('not completed')
  })
})
