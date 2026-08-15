import { demoRunSnapshotSchema } from '@zero-human/contracts'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  findUniqueOrThrow: vi.fn(),
}))

vi.mock('../db.js', () => ({
  db: { demoRun: { findUniqueOrThrow: mocks.findUniqueOrThrow } },
}))

import { getDemoRunSnapshot } from './demo-service.js'

const proofFixture = {
  payments: [],
  humanStudies: [],
  messages: [],
  agentHandoffs: [],
  workflowRuns: [],
  documents: [],
  companies: [],
  providerActions: [],
}

function snapshotFixture(checkoutUrl: string | null) {
  return {
    id: 'run-1',
    status: 'AWAITING_PAYMENT',
    mode: 'FAKE',
    workspace: {
      name: 'Hengxin Home',
      pilotActivation: {
        status: 'PENDING',
        amount: 500,
        currency: 'usd',
        checkoutUrl,
      },
    },
    approvals: [],
    opportunities: [],
    events: [],
    updatedAt: new Date('2026-08-15T12:00:00.000Z'),
  }
}

function mockPersistedCheckoutUrl(checkoutUrl: string | null) {
  mocks.findUniqueOrThrow.mockImplementation(async (query: { include?: { approvals?: boolean } }) =>
    query.include?.approvals ? snapshotFixture(checkoutUrl) : proofFixture,
  )
}

describe('public demo run snapshot', () => {
  beforeEach(() => {
    mocks.findUniqueOrThrow.mockReset()
  })

  it('omits a persisted Stripe Checkout capability URL from the public DTO', async () => {
    const persistedCheckoutUrl = 'https://checkout.stripe.com/c/pay/cs_test_secret'
    mockPersistedCheckoutUrl(persistedCheckoutUrl)

    const snapshot = await getDemoRunSnapshot('run-1')

    expect(snapshot.pilot.checkoutUrl).toBeNull()
    expect(JSON.stringify(snapshot)).not.toContain(persistedCheckoutUrl)
  })

  it('preserves the shared snapshot contract with a null checkoutUrl', async () => {
    mockPersistedCheckoutUrl(null)

    const snapshot = await getDemoRunSnapshot('run-1')

    expect(demoRunSnapshotSchema.parse(snapshot).pilot).toEqual({
      status: 'PENDING',
      amount: 500,
      currency: 'usd',
      checkoutUrl: null,
    })
  })
})
