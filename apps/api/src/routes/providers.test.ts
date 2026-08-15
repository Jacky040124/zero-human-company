import { describe, expect, it } from 'vitest'
import { Provider } from '@prisma/client'
import {
  claimProviderEvent,
  classifyExistingProviderReceipt,
  inboundMessageBody,
  isDurablyDeliveredNegotiationProposal,
  providerEventCreateData,
} from './providers.js'

describe('provider receipt replay classification', () => {
  const incoming = { payloadHash: 'hash_1', demoRunId: 'run_1', eventType: 'message.received' }

  it('resumes an identical receipt whose effects were not marked processed', () => {
    expect(classifyExistingProviderReceipt({ ...incoming, processedAt: null }, incoming)).toBe('RESUME')
  })

  it('does not repeat effects for an identical processed receipt', () => {
    expect(classifyExistingProviderReceipt({ ...incoming, processedAt: new Date() }, incoming)).toBe('DONE')
  })

  it.each([
    { ...incoming, payloadHash: 'different' },
    { ...incoming, demoRunId: 'run_2' },
    { ...incoming, eventType: 'message.sent' },
  ])('rejects reuse of an event id for a different payload or target', (mismatch) => {
    expect(() => classifyExistingProviderReceipt({ ...mismatch, processedAt: null }, incoming)).toThrow('reused')
  })
})

describe('provider receipt creation', () => {
  it('hashes the raw payload without including it in Prisma create data', () => {
    const data = providerEventCreateData({
      demoRunId: 'run_1',
      provider: Provider.DOCUMENSO,
      externalEventId: 'event_1',
      eventType: 'DOCUMENT_COMPLETED',
      raw: '{"secret":"must-not-be-stored"}',
    })

    expect(data).toEqual({
      demoRunId: 'run_1',
      provider: Provider.DOCUMENSO,
      externalEventId: 'event_1',
      eventType: 'DOCUMENT_COMPLETED',
      payloadHash: expect.stringMatching(/^[a-f0-9]{64}$/),
    })
    expect(data).not.toHaveProperty('raw')
  })

  it('grants exactly one lease when identical deliveries arrive concurrently', async () => {
    const input = {
      demoRunId: 'run_1',
      provider: Provider.LINQ,
      externalEventId: 'event_1',
      eventType: 'message.received',
      raw: '{"event":"same"}',
    }
    type StoredReceipt = ReturnType<typeof providerEventCreateData> & {
      id: string
      processedAt: Date | null
      processingToken: string | null
      processingExpiresAt: Date | null
    }
    let receipt: StoredReceipt | null = null
    const store = {
      async create({ data }: { data: Record<string, unknown> }) {
        if (receipt) throw Object.assign(new Error('unique'), { code: 'P2002' })
        receipt = {
          ...providerEventCreateData(input),
          id: 'receipt_1',
          processedAt: null,
          processingToken: String(data.processingToken),
          processingExpiresAt: data.processingExpiresAt as Date,
        }
        return receipt
      },
      async findUniqueOrThrow() {
        if (!receipt) throw new Error('missing')
        return receipt
      },
      async findUnique() {
        return receipt
      },
      async updateMany() {
        return { count: 0 }
      },
    }

    const [first, second] = await Promise.all([
      claimProviderEvent(input, { store, now: new Date('2026-08-15T10:00:00.000Z'), leaseToken: 'lease-a' }),
      claimProviderEvent(input, { store, now: new Date('2026-08-15T10:00:00.000Z'), leaseToken: 'lease-b' }),
    ])

    expect([first.status, second.status].sort()).toEqual(['BUSY', 'NEW'])
    expect([first, second].filter((claim) => 'leaseToken' in claim)).toHaveLength(1)
  })
})

describe('role-player evidence sanitization', () => {
  it('preserves verified Nordlicht deal terms while removing contact details', () => {
    expect(inboundMessageBody({
      optedOut: false,
      companyName: 'Nordlicht Import GmbH',
      text: 'We need two 40HQ containers at EUR 172/seat. Reply to buyer@example.com or https://example.com/deal',
    })).toBe('We need two 40HQ containers at EUR 172/seat. Reply to [email redacted] or [link redacted]')
  })
})

describe('explicit buyer acceptance gate', () => {
  const expected = { demoRunId: 'run_1', opportunityId: 'opp_1' }
  const action = {
    demoRunId: 'run_1',
    provider: Provider.LINQ,
    kind: 'message.send',
    idempotencyKey: 'linq-negotiation-proposal:run_1:opp_1:172',
    status: 'SUCCEEDED',
    live: true,
    providerExternalId: 'linq:proposal_1',
  }
  const message = {
    demoRunId: 'run_1',
    opportunityId: 'opp_1',
    direction: 'OUTBOUND',
    live: true,
    externalId: 'linq:proposal_1',
  }

  it('accepts only an exact live, succeeded action joined to its persisted outbound message', () => {
    expect(isDurablyDeliveredNegotiationProposal({ action, message }, expected)).toBe(true)
  })

  it.each([
    [{ ...action, status: 'RUNNING' }, message],
    [{ ...action, live: false }, message],
    [{ ...action, idempotencyKey: 'linq-outreach:run_1:opp_1' }, message],
    [action, { ...message, externalId: 'linq:other' }],
    [action, null],
  ])('rejects incomplete or mismatched delivery evidence', (candidateAction, candidateMessage) => {
    expect(isDurablyDeliveredNegotiationProposal({ action: candidateAction, message: candidateMessage }, expected)).toBe(false)
  })
})
