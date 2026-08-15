import { DemoRunStatus, Provider, RevisionStatus } from '@prisma/client'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => {
  const db = {
    demoRun: { findUniqueOrThrow: vi.fn(), updateMany: vi.fn() },
    providerAction: { upsert: vi.fn() },
    humanStudy: { findUnique: vi.fn(), upsert: vi.fn() },
    campaignRevision: { updateMany: vi.fn() },
    event: { findFirst: vi.fn() },
    $transaction: vi.fn(),
  }
  return {
    db,
    dispatchProviderAction: vi.fn(),
    appendRunEvent: vi.fn(),
  }
})

vi.mock('../db.js', () => ({ db: mocks.db }))
vi.mock('../outbox.js', () => ({ dispatchProviderAction: mocks.dispatchProviderAction }))
vi.mock('../domain/demo-service.js', () => ({
  appendRunEvent: mocks.appendRunEvent,
  transitionOpportunity: vi.fn(),
}))

import {
  assertLinqRecipientEligible,
  assertTeracStudyBoundToRevisions,
  bandRequestFromInbound,
  consentedLinqRequest,
  documensoBuyerFromLinqAcceptance,
  documensoEnvelopeRequest,
  evaluateBandVerdict,
  recipientFingerprint,
  resolveMonidCompanyMatch,
  runTeracCampaignStudy,
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

  it('serializes planned requests with only the consented role-player id and versioned safe intent', () => {
    const request = consentedLinqRequest('nordlicht', 'NEGOTIATION_PROPOSAL_V1', { proposalPrice: 172 })
    const serialized = JSON.stringify(request)

    expect(request).toEqual({
      recipient: { consented: true, rolePlayerId: 'nordlicht' },
      template: 'NEGOTIATION_PROPOSAL_V1',
      args: { proposalPrice: 172 },
    })
    expect(serialized).not.toContain(address)
    expect(serialized).not.toMatch(/address|email|Proposed commercial terms/i)
  })
})

describe('Terac workflow proof binding', () => {
  const expectedIds = ['candidate-a', 'candidate-b'] as const
  const completeStudy = {
    scores: [{ candidateId: 'candidate-a' }, { candidateId: 'candidate-b' }],
    baselineScores: { candidateId: 'baseline' },
  }

  it('accepts the exact submitted baseline and candidate revision ids', () => {
    expect(() => assertTeracStudyBoundToRevisions(completeStudy, 'baseline', expectedIds)).not.toThrow()
  })

  it('rejects missing, unrelated, or duplicate candidate revision ids', () => {
    const unrelated = { ...completeStudy, scores: [{ candidateId: 'candidate-a' }, { candidateId: 'unrelated' }] }
    const duplicate = { ...completeStudy, scores: [{ candidateId: 'candidate-a' }, { candidateId: 'candidate-a' }] }

    expect(() => assertTeracStudyBoundToRevisions(unrelated, 'baseline', expectedIds)).toThrow(/exactly match/)
    expect(() => assertTeracStudyBoundToRevisions(duplicate, 'baseline', expectedIds)).toThrow(/exactly match/)
  })

  it('rejects missing or unrelated baseline revision ids', () => {
    expect(() => assertTeracStudyBoundToRevisions(
      { ...completeStudy, baselineScores: { candidateId: 'unrelated' } },
      'baseline',
      expectedIds,
    )).toThrow(/baseline/)
    expect(() => assertTeracStudyBoundToRevisions(
      { scores: completeStudy.scores },
      'baseline',
      expectedIds,
    )).toThrow(/baseline/)
  })
})

describe('Terac study completion replay', () => {
  const providerResult = {
    externalId: 'terac-study-1',
    live: false,
    status: 'COMPLETED' as const,
    data: {
      status: 'COMPLETE' as const,
      studyId: 'terac-study-1',
      winnerId: 'candidate-b',
      source: 'rubric' as const,
      respondentCount: 8,
      baselineScores: { candidateId: 'baseline', clarity: 40, trust: 40, relevance: 40 },
      scores: [
        { candidateId: 'candidate-a', clarity: 61, trust: 62, relevance: 63 },
        { candidateId: 'candidate-b', clarity: 70, trust: 71, relevance: 72 },
      ],
    },
  }
  const expectedEvidence = {
    demoRunId: 'run-1',
    provider: Provider.TERAC,
    externalId: 'terac-study-1',
    live: false,
    status: 'COMPLETE',
    baselineScore: 40,
    selectedScore: 71,
    scoreDelta: 31,
    respondentCount: 8,
    rubric: {
      baseline: providerResult.data.baselineScores,
      selected: providerResult.data.scores[1],
    },
    selectedRevisionId: 'candidate-b',
  }

  function configureState(
    runStatus: DemoRunStatus,
    winnerStatus: RevisionStatus,
    durableEvidence: typeof expectedEvidence | null,
  ) {
    const state = { runStatus, winnerStatus, durableEvidence }
    mocks.db.demoRun.findUniqueOrThrow.mockResolvedValue({
      id: 'run-1',
      mode: 'FAKE',
      status: runStatus,
      campaign: {
        revisions: [
          { id: 'baseline', label: 'Baseline', body: { copy: 'baseline' }, status: RevisionStatus.UNDER_STUDY },
          { id: 'candidate-a', label: 'Candidate A', body: { copy: 'a' }, status: RevisionStatus.UNDER_STUDY },
          { id: 'candidate-b', label: 'Candidate B', body: { copy: 'b' }, status: winnerStatus },
        ],
      },
    })
    mocks.db.demoRun.updateMany.mockImplementation(async ({ where, data }) => {
      if (state.runStatus !== where.status) return { count: 0 }
      state.runStatus = data.status
      return { count: 1 }
    })
    mocks.db.campaignRevision.updateMany.mockImplementation(async ({ where, data }) => {
      if (state.winnerStatus !== where.status) return { count: 0 }
      state.winnerStatus = data.status
      return { count: 1 }
    })
    mocks.db.humanStudy.findUnique.mockImplementation(async () => state.durableEvidence)
    mocks.db.humanStudy.upsert.mockImplementation(async ({ create }) => {
      state.durableEvidence ??= create
      return state.durableEvidence
    })
    return state
  }

  beforeEach(() => {
    vi.clearAllMocks()
    mocks.db.$transaction.mockImplementation(async (callback) => callback(mocks.db))
    mocks.db.providerAction.upsert.mockResolvedValue({ id: 'provider-action-1' })
    mocks.dispatchProviderAction.mockResolvedValue(providerResult)
    mocks.db.event.findFirst.mockResolvedValue(null)
  })

  it('persists evidence once and advances only the first normal completion', async () => {
    const state = configureState(DemoRunStatus.STUDY_RUNNING, RevisionStatus.UNDER_STUDY, null)

    await runTeracCampaignStudy('run-1', new Map())

    expect(state.runStatus).toBe(DemoRunStatus.AWAITING_CAMPAIGN_APPROVAL)
    expect(state.winnerStatus).toBe(RevisionStatus.READY_FOR_APPROVAL)
    expect(state.durableEvidence).toEqual(expectedEvidence)
    expect(mocks.db.humanStudy.upsert).toHaveBeenCalledTimes(1)
    expect(mocks.appendRunEvent).toHaveBeenCalledTimes(1)
  })

  it('returns successfully after approval without demoting the active revision or run', async () => {
    const state = configureState(DemoRunStatus.RUNNING, RevisionStatus.ACTIVE, expectedEvidence)

    await runTeracCampaignStudy('run-1', new Map())

    expect(state.runStatus).toBe(DemoRunStatus.RUNNING)
    expect(state.winnerStatus).toBe(RevisionStatus.ACTIVE)
    expect(mocks.db.campaignRevision.updateMany).not.toHaveBeenCalled()
    expect(mocks.db.humanStudy.upsert).not.toHaveBeenCalled()
  })

  it('returns successfully after rejection without moving the paused run back to approval', async () => {
    const state = configureState(DemoRunStatus.PAUSED, RevisionStatus.READY_FOR_APPROVAL, expectedEvidence)

    await runTeracCampaignStudy('run-1', new Map())

    expect(state.runStatus).toBe(DemoRunStatus.PAUSED)
    expect(state.winnerStatus).toBe(RevisionStatus.READY_FOR_APPROVAL)
    expect(mocks.db.campaignRevision.updateMany).not.toHaveBeenCalled()
    expect(mocks.db.humanStudy.upsert).not.toHaveBeenCalled()
  })

  it('fails closed when an advanced run has conflicting durable evidence', async () => {
    const state = configureState(DemoRunStatus.RUNNING, RevisionStatus.ACTIVE, {
      ...expectedEvidence,
      selectedRevisionId: 'candidate-a',
    })

    await expect(runTeracCampaignStudy('run-1', new Map())).rejects.toThrow(/conflicts with durable study evidence/)

    expect(state.runStatus).toBe(DemoRunStatus.RUNNING)
    expect(state.winnerStatus).toBe(RevisionStatus.ACTIVE)
    expect(mocks.db.campaignRevision.updateMany).not.toHaveBeenCalled()
  })
})

describe('Documenso buyer consent evidence', () => {
  const buyerEmail = 'anja@nordlicht.example'
  const acceptedAt = new Date('2026-08-15T10:00:03.000Z')
  const buyerContact = {
    name: 'Anja Keller',
    consented: true,
    rolePlayer: true,
    addressHash: recipientFingerprint(buyerEmail),
  }
  const acceptance = {
    demoRunId: 'run-1',
    opportunityId: 'opp-nordlicht',
    type: 'agreement.accepted',
    actor: 'linq',
    proofRef: 'linq-acceptance-1',
    occurredAt: acceptedAt,
  }
  const receipt = {
    demoRunId: 'run-1',
    provider: Provider.LINQ,
    externalEventId: 'linq-acceptance-1',
    eventType: 'message.received',
    processedAt: new Date('2026-08-15T10:00:04.000Z'),
  }

  it('returns the persisted contact identity and acceptance timestamp without the configured email', () => {
    const buyer = documensoBuyerFromLinqAcceptance(
      buyerContact,
      buyerEmail,
      acceptance,
      receipt,
      { demoRunId: 'run-1', opportunityId: 'opp-nordlicht' },
    )
    expect(buyer).toEqual({
      name: 'Anja Keller',
      identityRole: 'buyer',
      consentedAt: '2026-08-15T10:00:03.000Z',
    })
    const serializedActionRequest = JSON.stringify(documensoEnvelopeRequest(buyer))
    expect(serializedActionRequest).not.toMatch(/anja@nordlicht\.example|email/i)
  })

  it('rejects an arbitrary buyer email that is not the consenting contact identity', () => {
    expect(() => documensoBuyerFromLinqAcceptance(
      buyerContact,
      'arbitrary@example.com',
      acceptance,
      receipt,
      { demoRunId: 'run-1', opportunityId: 'opp-nordlicht' },
    )).toThrow(/does not match/)
  })

  it('rejects missing or unprocessed explicit acceptance evidence', () => {
    expect(() => documensoBuyerFromLinqAcceptance(
      buyerContact,
      buyerEmail,
      null,
      receipt,
      { demoRunId: 'run-1', opportunityId: 'opp-nordlicht' },
    )).toThrow(/explicit Linq acceptance/)
    expect(() => documensoBuyerFromLinqAcceptance(
      buyerContact,
      buyerEmail,
      acceptance,
      { ...receipt, processedAt: null },
      { demoRunId: 'run-1', opportunityId: 'opp-nordlicht' },
    )).toThrow(/processed Linq acceptance receipt/)
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
