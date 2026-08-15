import { DemoRunStatus, PilotStatus, RevisionStatus, RunMode } from '@prisma/client'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  findUniqueOrThrow: vi.fn(),
  transaction: vi.fn(),
  appendRunEvent: vi.fn(),
}))

vi.mock('../db.js', () => ({
  db: {
    demoRun: { findUniqueOrThrow: mocks.findUniqueOrThrow },
    $transaction: mocks.transaction,
  },
}))

vi.mock('./demo-service.js', () => ({
  appendRunEvent: mocks.appendRunEvent,
  applyMaasPolicyBranch: vi.fn(),
  createDemoRun: vi.fn(),
  decideCampaign: vi.fn(),
  recordOwnerSignature: vi.fn(),
  transitionOpportunity: vi.fn(),
}))

import {
  assertFreshFakeRehearsalTarget,
  FakeRehearsalConflictError,
  fakeDocumentEvidenceTimestamps,
  runFakeRehearsal,
} from './fake-run.js'

function freshRun() {
  return {
    id: 'run-1',
    mode: RunMode.FAKE,
    status: DemoRunStatus.AWAITING_PAYMENT,
    eventSequence: 1,
    workspace: { pilotActivation: { id: 'pilot-1', status: PilotStatus.PENDING, paidAt: null } },
    campaign: {
      activeRevisionId: null,
      revisions: [
        { id: 'baseline', label: 'Baseline', status: RevisionStatus.UNDER_STUDY },
        { id: 'candidate-a', label: 'Candidate A', status: RevisionStatus.UNDER_STUDY },
        { id: 'candidate-b', label: 'Candidate B', status: RevisionStatus.UNDER_STUDY },
      ],
    },
    opportunities: [{ stage: 'RESEARCHING', version: 0, sequence: 0 }],
    companies: [{ monidProviderId: null, monidLive: false }],
    events: [{ type: 'demo.created' }],
    _count: {
      payments: 0,
      humanStudies: 0,
      messages: 0,
      agentHandoffs: 0,
      workflowRuns: 0,
      renderTaskIntents: 0,
      documents: 0,
      approvals: 0,
      providerEvents: 0,
      providerActions: 0,
    },
  }
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('fake rehearsal guard', () => {
  it('accepts the untouched seeded FAKE run', () => {
    expect(() => assertFreshFakeRehearsalTarget(freshRun())).not.toThrow()
  })

  it('rejects a JUDGE run before any write', async () => {
    mocks.findUniqueOrThrow.mockResolvedValue({ ...freshRun(), mode: RunMode.JUDGE })

    await expect(runFakeRehearsal('judge-run')).rejects.toBeInstanceOf(FakeRehearsalConflictError)

    expect(mocks.transaction).not.toHaveBeenCalled()
    expect(mocks.appendRunEvent).not.toHaveBeenCalled()
  })

  it('rejects a contaminated initial run before any write', async () => {
    const run = freshRun()
    run._count.payments = 1
    mocks.findUniqueOrThrow.mockResolvedValue(run)

    await expect(runFakeRehearsal('contaminated-run')).rejects.toBeInstanceOf(FakeRehearsalConflictError)

    expect(mocks.transaction).not.toHaveBeenCalled()
    expect(mocks.appendRunEvent).not.toHaveBeenCalled()
  })

  it('rejects a duplicate rehearsal after the run has advanced', async () => {
    mocks.findUniqueOrThrow.mockResolvedValue({ ...freshRun(), status: DemoRunStatus.COMPLETE })

    await expect(runFakeRehearsal('completed-run')).rejects.toBeInstanceOf(FakeRehearsalConflictError)

    expect(mocks.transaction).not.toHaveBeenCalled()
    expect(mocks.appendRunEvent).not.toHaveBeenCalled()
  })

  it('loses an atomic claim race without creating payment state', async () => {
    const paymentCreate = vi.fn()
    const pilotUpdate = vi.fn()
    mocks.findUniqueOrThrow.mockResolvedValue(freshRun())
    mocks.transaction.mockImplementationOnce(async (operation: (tx: unknown) => Promise<unknown>) => operation({
      demoRun: { updateMany: vi.fn().mockResolvedValue({ count: 0 }) },
      pilotActivation: { updateMany: pilotUpdate },
      payment: { create: paymentCreate },
    }))

    await expect(runFakeRehearsal('raced-run')).rejects.toBeInstanceOf(FakeRehearsalConflictError)

    expect(pilotUpdate).not.toHaveBeenCalled()
    expect(paymentCreate).not.toHaveBeenCalled()
    expect(mocks.appendRunEvent).not.toHaveBeenCalled()
  })
})

describe('fake document evidence', () => {
  it('uses deterministic owner-first signing timestamps', () => {
    const first = fakeDocumentEvidenceTimestamps()
    const second = fakeDocumentEvidenceTimestamps()

    expect(second).toEqual(first)
    expect(first.ownerSignedAt.getTime()).toBeLessThan(first.buyerSignedAt.getTime())
    expect(first.buyerSignedAt.getTime()).toBeLessThanOrEqual(first.completedAt.getTime())
  })
})
