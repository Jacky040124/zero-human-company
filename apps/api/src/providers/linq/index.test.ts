import { createHmac } from 'node:crypto'
import { describe, expect, it, vi } from 'vitest'
import { ProviderOutcomeUnknownError } from '../types.js'
import {
  fingerprintLinqAddress,
  isExplicitAcceptance,
  isOptOutMessage,
  LinqMessageProvider,
  parseMaasSeatPrice,
  renderLinqMessage,
  verifyLinqWebhook,
} from './index.js'

const config = {
  apiBaseUrl: 'https://linq.example/api/partner',
  apiKey: 'secret-api-key',
  webhookSecret: `whsec_${Buffer.from('webhook-secret').toString('base64')}`,
  recipientAddresses: {
    rp_nordlicht: '+14155550123',
    rp_1: '+14155550123',
  },
}

describe('LinqMessageProvider', () => {
  it('renders the versioned intent and sends to only the configured consented recipient', async () => {
    const fetchMock = vi.fn(async (_input: string | URL | Request, _init?: RequestInit) =>
      new Response(
        JSON.stringify({
          chat_id: 'chat_1',
          service: 'iMessage',
          message: { id: 'message_1' },
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      ),
    )
    const provider = new LinqMessageProvider(config, fetchMock as typeof fetch)
    const result = await provider.execute({
      demoRunId: 'run_1',
      idempotencyKey: 'idem_1',
      payload: {
        recipient: { consented: true, rolePlayerId: 'rp_nordlicht' },
        template: 'OUTREACH_V1',
        args: {},
      },
    })

    const [url, init] = fetchMock.mock.calls[0]!
    expect(String(url)).toBe('https://linq.example/api/partner/v3/messages')
    expect(JSON.parse(String(init?.body))).toEqual({
      to: ['+14155550123'],
      message: {
        parts: [{
          type: 'text',
          value: 'Hengxin Home pilot discussion\n\nWe would like to discuss a two-container furniture pilot with your team. FSC Mix documentation is available, with an EU sofa target price of EUR 172 per seat and an approved floor of EUR 158 per seat.',
        }],
        idempotency_key: 'idem_1',
      },
    })
    expect(result.data).toEqual({ messageId: 'message_1', chatId: 'chat_1', service: 'iMessage' })
    expect(JSON.stringify(result)).not.toContain('+14155550123')
    expect(JSON.stringify(result)).not.toContain('secret-api-key')
  })

  it('rejects a recipient without explicit consent before any request', async () => {
    const fetchMock = vi.fn()
    const provider = new LinqMessageProvider(config, fetchMock as typeof fetch)
    await expect(
      provider.execute({
        demoRunId: 'run_1',
        idempotencyKey: 'idem_1',
        payload: {
          recipient: { consented: false, rolePlayerId: 'rp_1' },
          template: 'OUTREACH_V1',
          args: {},
        } as never,
      }),
    ).rejects.toThrow('explicitly consented')
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('fails closed when the persisted role-player id is not configured', async () => {
    const fetchMock = vi.fn()
    const provider = new LinqMessageProvider(config, fetchMock as typeof fetch)

    await expect(provider.execute({
      demoRunId: 'run_1',
      idempotencyKey: 'idem_1',
      payload: {
        recipient: { consented: true, rolePlayerId: 'not-allowlisted' },
        template: 'OUTREACH_V1',
        args: {},
      },
    })).rejects.toThrow('no configured allowlisted recipient')
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('marks a network failure as outcome unknown', async () => {
    const provider = new LinqMessageProvider(
      config,
      vi.fn().mockRejectedValue(new Error('socket closed')) as typeof fetch,
    )
    await expect(
      provider.execute({
        demoRunId: 'run_1',
        idempotencyKey: 'idem_1',
        payload: {
          recipient: { consented: true, rolePlayerId: 'rp_1' },
          template: 'OUTREACH_V1',
          args: {},
        },
      }),
    ).rejects.toBeInstanceOf(ProviderOutcomeUnknownError)
  })

  it('renders each versioned intent deterministically and accepts only safe proposal args', () => {
    const recipient = { consented: true as const, rolePlayerId: 'rp_nordlicht' }

    expect(renderLinqMessage({ recipient, template: 'OUTREACH_V1', args: {} }))
      .toContain('Hengxin Home pilot discussion')
    expect(renderLinqMessage({ recipient, template: 'MAAS_POLICY_V1', args: {} }))
      .toContain('consented hackathon policy test')
    expect(renderLinqMessage({
      recipient,
      template: 'NEGOTIATION_PROPOSAL_V1',
      args: { proposalPrice: 172 },
    })).toContain('EUR 172 per seat')
    expect(() => renderLinqMessage({
      recipient,
      template: 'OUTREACH_V1',
      args: { proposalPrice: 172 },
    })).toThrow('does not accept template arguments')
  })
})

describe('Linq webhooks', () => {
  function signedWebhook(text = 'STOP', timestamp = 1_800_000_000) {
    const body = JSON.stringify({
      api_version: 'v3',
      webhook_version: '2026-02-03',
      event_type: 'message.received',
      event_id: 'event_1',
      created_at: '2027-01-15T08:00:00.000Z',
      data: {
        id: 'message_1',
        chat: { id: 'chat_1' },
        sender_handle: { handle: '+14155550123' },
        parts: [{ type: 'text', value: text }],
      },
    })
    const signed = `event_1.${timestamp}.${body}`
    const signature = createHmac('sha256', Buffer.from('webhook-secret'))
      .update(signed)
      .digest('base64')
    return {
      body,
      headers: {
        'webhook-id': 'event_1',
        'webhook-timestamp': String(timestamp),
        'webhook-signature': `v1,${signature}`,
      },
      nowMs: timestamp * 1000,
    }
  }

  it('verifies the raw body and returns a stable event id plus opt-out state', () => {
    const webhook = signedWebhook('Please stop messaging me')
    const parsed = verifyLinqWebhook(
      webhook.body,
      webhook.headers,
      config.webhookSecret,
      webhook.nowMs,
    )
    expect(parsed).toMatchObject({
      eventId: 'event_1',
      eventType: 'message.received',
      messageId: 'message_1',
      chatId: 'chat_1',
      optedOut: true,
    })
    expect(JSON.stringify(parsed)).not.toContain('+14155550123')
  })

  it('rejects a mismatched event id, stale timestamp, and bad signature', () => {
    const webhook = signedWebhook()
    expect(() =>
      verifyLinqWebhook(webhook.body, { ...webhook.headers, 'webhook-id': 'other' }, config.webhookSecret, webhook.nowMs),
    ).toThrow()
    expect(() =>
      verifyLinqWebhook(webhook.body, webhook.headers, config.webhookSecret, webhook.nowMs + 301_000),
    ).toThrow('five-minute')
    expect(() =>
      verifyLinqWebhook(webhook.body, { ...webhook.headers, 'webhook-signature': 'v1,bad' }, config.webhookSecret, webhook.nowMs),
    ).toThrow('signature')
  })
})

describe('isOptOutMessage', () => {
  it.each(['STOP', 'unsubscribe', 'opt-out', 'OPT OUT', 'Please stop texting me'])('%s', (text) => {
    expect(isOptOutMessage(text)).toBe(true)
  })

  it.each(['Please stop by tomorrow', 'The campaign ends Friday', 'Hello'])('%s', (text) => {
    expect(isOptOutMessage(text)).toBe(false)
  })
})

describe('truthful buyer reply parsing', () => {
  it.each([
    ['EUR 150/seat', 150],
    ['Our requested price is €172 per seat.', 172],
    ['We need 158 EUR per seat', 158],
    ['Two containers, but no price yet', null],
  ])('derives a Maas price only from verified text: %s', (text, expected) => {
    expect(parseMaasSeatPrice(text)).toBe(expected)
  })

  it.each(['We accept the terms.', 'I agree', 'Accepted', 'Deal!'])('recognizes explicit acceptance: %s', (text) => {
    expect(isExplicitAcceptance(text)).toBe(true)
  })

  it.each(['We do not accept', 'We accept if delivery is free', 'Sounds promising', 'Can you revise the price?'])(
    'does not invent acceptance: %s',
    (text) => expect(isExplicitAcceptance(text)).toBe(false),
  )

  it('uses the same stable fingerprint as stored consent records', () => {
    expect(fingerprintLinqAddress('+14155550123')).toBe('36a2cef4ff9bf7a1')
  })
})
