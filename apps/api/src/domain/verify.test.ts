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
  summary?: Record<string, unknown>
  data?: Record<string, unknown>
  handoffs?: Array<Record<string, unknown>>
} = {}) {
  return {
    id: 'run-1',
    mode: 'JUDGE',
    status: 'COMPLETE',
    approvals: [],
    payments: [],
    humanStudies: [],
    workflowRuns: [],
    documents: [],
    messages: [],
    companies: [],
    opportunities: [],
    providerEvents: [],
    events: [],
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
      providerExternalId: input.actionExternalId ?? 'band:room-1',
      redactedResponse: {
        summary: input.summary ?? bandSummary(),
        data: input.data ?? bandResult(),
      },
    }],
  }
}

function bandCheck(report: VerificationReport) {
  const check = report.checks.find((item) => item.name === 'real Band external-agent verdict')
  expect(check, 'Band verification check should be present').toBeDefined()
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
