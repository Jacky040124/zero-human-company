import { describe, expect, it } from 'vitest'
import { classifyExistingProviderReceipt, inboundMessageBody } from './providers.js'

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

describe('role-player evidence sanitization', () => {
  it('preserves verified Nordlicht deal terms while removing contact details', () => {
    expect(inboundMessageBody({
      optedOut: false,
      companyName: 'Nordlicht Import GmbH',
      text: 'We need two 40HQ containers at EUR 172/seat. Reply to buyer@example.com or https://example.com/deal',
    })).toBe('We need two 40HQ containers at EUR 172/seat. Reply to [email redacted] or [link redacted]')
  })
})
