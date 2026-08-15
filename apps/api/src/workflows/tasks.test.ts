import { describe, expect, it } from 'vitest'
import {
  assertLinqRecipientEligible,
  bandRequestFromInbound,
  evaluateBandVerdict,
  recipientFingerprint,
  resolveMonidCompanyMatch,
} from './tasks.js'

const company = {
  name: 'Nordlicht Import GmbH',
  researchOnly: false,
  monidProviderId: null,
}

const address = '+15551234567'
const contact = {
  consented: true,
  rolePlayer: true,
  addressHash: recipientFingerprint(address),
}

const verdict = {
  recommendation: 'COUNTER' as const,
  proposedPrice: 172,
  risks: ['Buyer acceptance remains outstanding'],
  rationale: 'The proposal is within policy.',
  agentVotes: [
    { agentId: 'policy', vote: 'COUNTER' as const, rationale: 'Meets the floor.' },
  ],
}

describe('Linq workflow consent gate', () => {
  it('allows only a matching consent fingerprint on a non-research company', () => {
    expect(() => assertLinqRecipientEligible(company, contact, address)).not.toThrow()
    expect(() => assertLinqRecipientEligible(company, contact, '+15557654321')).toThrow(/consent fingerprint/)
    expect(() => assertLinqRecipientEligible({ ...company, researchOnly: true }, contact, address)).toThrow(/research-only/)
    expect(() => assertLinqRecipientEligible({ ...company, monidProviderId: 'monid-1' }, contact, address)).toThrow(/Monid-discovered/)
  })
})

describe('Monid materialization collision gate', () => {
  it('skips a seeded company name instead of overwriting it with Monid data', () => {
    const seeded = { id: 'seeded-nordlicht', monidProviderId: null, researchOnly: false }
    expect(resolveMonidCompanyMatch(null, seeded, 'monid-company-1')).toEqual({
      action: 'SKIP_COLLISION',
    })
  })

  it('reuses the existing Monid company on retry', () => {
    const discovered = { id: 'discovered-1', monidProviderId: 'monid-company-1', researchOnly: true }
    expect(resolveMonidCompanyMatch(discovered, null, 'monid-company-1')).toEqual({
      action: 'USE',
      company: discovered,
    })
  })
})

describe('Band workflow policy gate', () => {
  it('uses only the verified inbound body as the buyer brief', () => {
    const request = bandRequestFromInbound('Buyer asked to discuss delivery timing.')
    expect(request).toEqual({
      brief: 'Buyer asked to discuss delivery timing.',
      currency: 'EUR',
      localPolicy: 'Seller target EUR 172 per seat; hard floor EUR 158 per seat. Do not make binding legal claims. Local policy is authoritative.',
    })
    expect(request).not.toHaveProperty('askingPrice')
    expect(request.brief).not.toMatch(/40HQ|boucl|German law/i)
  })

  it('rejects an empty sanitized inbound body', () => {
    expect(() => bandRequestFromInbound('   ')).toThrow(/no usable sanitized body/)
  })

  it('approves a schema-valid price at or above the local floor', () => {
    expect(evaluateBandVerdict(verdict)).toMatchObject({ outcome: 'APPROVE', proposedPrice: 172 })
  })

  it('pauses a below-floor proposal locally', () => {
    expect(evaluateBandVerdict({ ...verdict, proposedPrice: 157 })).toMatchObject({
      outcome: 'PAUSE',
      reason: 'POLICY_BELOW_FLOOR',
    })
  })

  it('fails a proceed verdict without a usable price', () => {
    expect(() => evaluateBandVerdict({ ...verdict, proposedPrice: null })).toThrow(/malformed verdict/)
  })

  it('pauses rejection before any proposal can be sent', () => {
    expect(evaluateBandVerdict({ ...verdict, recommendation: 'REJECT' })).toMatchObject({
      outcome: 'PAUSE',
      reason: 'BAND_REJECT',
    })
  })
})
