import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  findUniqueOrThrow: vi.fn(),
  collectProof: vi.fn(),
}))

vi.mock('../db.js', () => ({
  db: { demoRun: { findUniqueOrThrow: mocks.findUniqueOrThrow } },
}))

vi.mock('./demo-service.js', () => ({ collectProof: mocks.collectProof }))

import { verifyDemoRun, type VerificationReport } from './verify.js'

const validVerdict = {
  recommendation: 'COUNTER' as const,
  proposedPrice: 172,
  risks: ['Delivery timing'],
  rationale: 'The proposed price remains above the local floor.',
  agentVotes: [
    { agentId: 'researcher', vote: 'COUNTER' as const, rationale: 'Evidence supports a counter.' },
    { agentId: 'negotiator', vote: 'COUNTER' as const, rationale: 'The terms remain workable.' },
    { agentId: 'policy', vote: 'ACCEPT' as const, rationale: 'The price meets the floor.' },
  ],
}

const externalAgentIds = {
  negotiator: 'band-negotiator-1',
  researcher: 'band-researcher-1',
  policyReviewer: 'band-policy-1',
}

function bandResult(
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    roomId: 'room-1',
    briefMessageId: 'brief-1',
    verdict: validVerdict,
    externalAgentIds,
    runtime: 'CODEX',
    model: 'gpt-5.6-sol',
    localPolicyAuthoritative: true,
    ...overrides,
  }
}

function bandSummary(
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  const { verdict: _verdict, ...summary } = bandResult(overrides)
  return summary
}

function runFixture(input: {
  actionExternalId?: string
  actionIdempotencyKey?: string
  summary?: Record<string, unknown>
  data?: Record<string, unknown>
  handoffs?: Array<Record<string, unknown>>
  events?: Array<Record<string, unknown>>
  proposalAction?: Record<string, unknown> | null
  messages?: Array<Record<string, unknown>>
  documents?: Array<Record<string, unknown>>
  providerEvents?: Array<Record<string, unknown>>
} = {}) {
  const storedData = input.data ?? bandResult()
  const storedVerdict = storedData.verdict as { proposedPrice?: number | null } | undefined
  const proposedPrice = storedVerdict?.proposedPrice ?? 172
  return {
    id: 'run-1',
    mode: 'JUDGE',
    status: 'COMPLETE',
    approvals: [],
    payments: [],
    humanStudies: [],
    workflowRuns: [],
    documents: input.documents ?? [],
    messages: input.messages ?? [{
      opportunityId: 'opp-nordlicht',
      direction: 'OUTBOUND',
      live: true,
      externalId: 'linq:proposal-1',
      occurredAt: new Date('2026-08-15T10:00:02.000Z'),
    }],
    companies: [],
    opportunities: [{ id: 'opp-nordlicht', stage: 'SIGNED', company: { name: 'Nordlicht Import GmbH' } }],
    providerEvents: input.providerEvents ?? [],
    events: input.events ?? [
      { opportunityId: 'opp-nordlicht', type: 'band.verdict', sequence: 3, proofRef: 'band:room-1', summary: 'Band approved a floor-safe verdict.', occurredAt: new Date('2026-08-15T10:00:00.000Z') },
      { opportunityId: 'opp-nordlicht', type: 'proposal.sent', sequence: 4, proofRef: 'linq:proposal-1', summary: 'The in-policy proposal was sent.', occurredAt: new Date('2026-08-15T10:00:02.000Z') },
      { opportunityId: 'opp-nordlicht', type: 'agreement.accepted', sequence: 5, proofRef: 'linq:acceptance-1', summary: 'The buyer explicitly accepted later.', occurredAt: new Date('2026-08-15T10:00:03.000Z') },
    ],
    agentHandoffs: input.handoffs ?? [{
      roomId: 'room-1',
      live: true,
      status: 'COMPLETE',
      verdict: validVerdict,
    }],
    providerActions: [{
      provider: 'BAND',
      kind: 'external-agents.negotiation',
      live: true,
      status: 'SUCCEEDED',
      idempotencyKey: input.actionIdempotencyKey ?? 'band-negotiation:run-1:opp-nordlicht',
      providerExternalId: input.actionExternalId ?? 'band:room-1',
      redactedResponse: {
        summary: input.summary ?? bandSummary(),
        data: storedData,
      },
    }, ...(input.proposalAction === null ? [] : [input.proposalAction ?? {
      provider: 'LINQ',
      kind: 'message.send',
      live: true,
      status: 'SUCCEEDED',
      idempotencyKey: `linq-negotiation-proposal:run-1:opp-nordlicht:${proposedPrice}`,
      providerExternalId: 'linq:proposal-1',
      createdAt: new Date('2026-08-15T10:00:01.000Z'),
    }])],
  }
}

function bandCheck(report: VerificationReport) {
  const check = report.checks.find((item) => item.name === 'real Band external-agent verdict')
  expect(check, 'Band verification check should be present').toBeDefined()
  return check!
}

function documensoCheck(report: VerificationReport) {
  const check = report.checks.find((item) => item.name === 'Documenso completed')
  expect(check, 'Documenso verification check should be present').toBeDefined()
  return check!
}

async function verifyBand(input: Parameters<typeof runFixture>[0] = {}) {
  mocks.findUniqueOrThrow.mockResolvedValue(runFixture(input))
  return bandCheck(await verifyDemoRun('run-1'))
}

describe('strict Band proof verification', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.collectProof.mockResolvedValue([])
  })

  it('passes a coherent live proof from three unique external Codex/Sol agents', async () => {
    await expect(verifyBand()).resolves.toMatchObject({ passed: true })
  })

  it.each([
    ['provider external id', { actionExternalId: 'band:room-2' }],
    ['redacted summary', { summary: bandSummary({ roomId: 'room-2' }) }],
    ['stored result', { data: bandResult({ roomId: 'room-2' }) }],
    ['durable handoff', {
      handoffs: [{ roomId: 'room-2', live: true, status: 'COMPLETE', verdict: validVerdict }],
    }],
  ])('rejects a room mismatch in the %s', async (_location, input) => {
    await expect(verifyBand(input)).resolves.toMatchObject({ passed: false })
  })

  it('rejects proof mixed from different provider results', async () => {
    await expect(verifyBand({
      summary: bandSummary({ roomId: 'room-1', briefMessageId: 'brief-from-room-1' }),
      data: bandResult({ roomId: 'room-2', briefMessageId: 'brief-from-room-2' }),
    })).resolves.toMatchObject({ passed: false })
  })

  it('requires the stored result and durable handoff to contain the same verdict', async () => {
    await expect(verifyBand({
      handoffs: [{
        roomId: 'room-1',
        live: true,
        status: 'COMPLETE',
        verdict: { ...validVerdict, proposedPrice: 171 },
      }],
    })).resolves.toMatchObject({ passed: false })
  })

  it.each([
    ['the action is for another opportunity', {
      actionIdempotencyKey: 'band-negotiation:run-1:opp-other',
    }],
    ['the verdict event does not reference the Band room', {
      events: [
        { opportunityId: 'opp-nordlicht', type: 'band.verdict', sequence: 3, proofRef: 'band:room-other', summary: 'Band approved a floor-safe verdict.', occurredAt: new Date('2026-08-15T10:00:00.000Z') },
        { opportunityId: 'opp-nordlicht', type: 'proposal.sent', sequence: 4, proofRef: 'linq:proposal-1', summary: 'The in-policy proposal was sent.', occurredAt: new Date('2026-08-15T10:00:02.000Z') },
        { opportunityId: 'opp-nordlicht', type: 'agreement.accepted', sequence: 5, proofRef: 'linq:acceptance-1', summary: 'The buyer explicitly accepted later.', occurredAt: new Date('2026-08-15T10:00:03.000Z') },
      ],
    }],
    ['the proposal predates the Band verdict', {
      events: [
        { opportunityId: 'opp-nordlicht', type: 'proposal.sent', sequence: 2, proofRef: 'linq:proposal-1', summary: 'The proposal was sent too early.', occurredAt: new Date('2026-08-15T09:59:59.000Z') },
        { opportunityId: 'opp-nordlicht', type: 'band.verdict', sequence: 3, proofRef: 'band:room-1', summary: 'Band approved a floor-safe verdict.', occurredAt: new Date('2026-08-15T10:00:00.000Z') },
        { opportunityId: 'opp-nordlicht', type: 'agreement.accepted', sequence: 5, proofRef: 'linq:acceptance-1', summary: 'The buyer explicitly accepted later.', occurredAt: new Date('2026-08-15T10:00:03.000Z') },
      ],
    }],
  ])('rejects Band proof when %s', async (_case, input) => {
    await expect(verifyBand(input)).resolves.toMatchObject({ passed: false })
  })

  it('accepts a fast buyer webhook recorded before the proposal response event', async () => {
    await expect(verifyBand({
      events: [
        { opportunityId: 'opp-nordlicht', type: 'band.verdict', sequence: 3, proofRef: 'band:room-1', summary: 'Band approved a floor-safe verdict.', occurredAt: new Date('2026-08-15T10:00:00.000Z') },
        { opportunityId: 'opp-nordlicht', type: 'agreement.accepted', sequence: 4, proofRef: 'linq:acceptance-1', summary: 'The buyer accepted after the send began.', occurredAt: new Date('2026-08-15T10:00:01.500Z') },
        { opportunityId: 'opp-nordlicht', type: 'proposal.sent', sequence: 5, proofRef: 'linq:proposal-1', summary: 'The provider response returned after the webhook.', occurredAt: new Date('2026-08-15T10:00:02.000Z') },
      ],
    })).resolves.toMatchObject({ passed: true })
  })

  it.each([
    ['a missing identity', { negotiator: externalAgentIds.negotiator, researcher: externalAgentIds.researcher }],
    ['duplicate identities', { ...externalAgentIds, policyReviewer: externalAgentIds.researcher }],
    ['more than three identities', { ...externalAgentIds, observer: 'band-observer-1' }],
  ])('rejects %s', async (_case, identities) => {
    await expect(verifyBand({
      summary: bandSummary({ externalAgentIds: identities }),
      data: bandResult({ externalAgentIds: identities }),
    })).resolves.toMatchObject({ passed: false })
  })

  it.each([
    ['the runtime is not Codex', { runtime: 'OTHER' }],
    ['the model is not gpt-5.6-sol', { model: 'gpt-5.6-luna' }],
  ])('rejects proof when %s', async (_case, override) => {
    await expect(verifyBand({
      summary: bandSummary(override),
      data: bandResult(override),
    })).resolves.toMatchObject({ passed: false })
  })

  it.each([
    ['ACCEPT at the floor', 'ACCEPT', 158, true],
    ['COUNTER above the floor', 'COUNTER', 172, true],
    ['ACCEPT below the floor', 'ACCEPT', 157, false],
    ['COUNTER without a price', 'COUNTER', null, false],
    ['REJECT above the floor', 'REJECT', 172, false],
  ] as const)('%s', async (_case, recommendation, proposedPrice, expected) => {
    const verdict = { ...validVerdict, recommendation, proposedPrice }
    await expect(verifyBand({
      data: bandResult({ verdict }),
      handoffs: [{ roomId: 'room-1', live: true, status: 'COMPLETE', verdict }],
    })).resolves.toMatchObject({ passed: expected })
  })
})

describe('strict Documenso proof verification', () => {
  const ownerSignedAt = new Date('2026-08-15T10:01:00.000Z')
  const buyerSignedAt = new Date('2026-08-15T10:02:00.000Z')
  const completedAt = new Date('2026-08-15T10:02:00.000Z')
  const document = {
    externalId: 'doc-1',
    live: true,
    status: 'COMPLETED',
    ownerSignedAt,
    buyerSignedAt,
    completedAt,
  }
  const receipts = [
    { provider: 'DOCUMENSO', eventType: 'DOCUMENT_SIGNED', externalEventId: `doc-1:DOCUMENT_SIGNED:${ownerSignedAt.toISOString()}`, processedAt: new Date('2026-08-15T10:01:01.000Z') },
    { provider: 'DOCUMENSO', eventType: 'DOCUMENT_COMPLETED', externalEventId: `doc-1:DOCUMENT_COMPLETED:${buyerSignedAt.toISOString()}`, processedAt: new Date('2026-08-15T10:02:01.000Z') },
  ]

  beforeEach(() => {
    vi.clearAllMocks()
    mocks.collectProof.mockResolvedValue([])
  })

  async function verifyDocumenso(input: Parameters<typeof runFixture>[0]) {
    mocks.findUniqueOrThrow.mockResolvedValue(runFixture(input))
    return documensoCheck(await verifyDemoRun('run-1'))
  }

  it('accepts ordered timestamps backed by processed receipts for the same document', async () => {
    await expect(verifyDocumenso({ documents: [document], providerEvents: receipts })).resolves.toMatchObject({ passed: true })
  })

  it('accepts an equivalent signed timestamp that uses an explicit UTC offset', async () => {
    const offsetReceipts = [
      { ...receipts[0], externalEventId: 'doc-1:DOCUMENT_SIGNED:2026-08-15T03:01:00.000-07:00' },
      receipts[1],
    ]
    await expect(verifyDocumenso({ documents: [document], providerEvents: offsetReceipts })).resolves.toMatchObject({ passed: true })
  })

  it.each([
    ['equal owner and buyer timestamps', { ...document, ownerSignedAt: buyerSignedAt }, receipts],
    ['completion before the buyer signature', { ...document, completedAt: new Date('2026-08-15T10:01:59.000Z') }, receipts],
    ['a missing owner receipt', document, receipts.slice(1)],
    ['a completion receipt for another document', document, [receipts[0], { ...receipts[1], externalEventId: `doc-2:DOCUMENT_COMPLETED:${buyerSignedAt.toISOString()}` }]],
    ['an unprocessed completion receipt', document, [receipts[0], { ...receipts[1], processedAt: null }]],
  ])('rejects %s', async (_case, candidateDocument, candidateReceipts) => {
    await expect(verifyDocumenso({ documents: [candidateDocument], providerEvents: candidateReceipts })).resolves.toMatchObject({ passed: false })
  })
})
