import { ProviderActionStatus } from '@prisma/client'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const database = vi.hoisted(() => ({
  findUniqueOrThrow: vi.fn(),
  update: vi.fn(),
  updateMany: vi.fn(),
}))

vi.mock('./db.js', () => ({ db: { providerAction: database } }))

import {
  dispatchProviderAction,
  ProviderReconciliationPendingError,
  type ProviderRegistry,
} from './outbox.js'
import { ProviderOutcomeUnknownError } from './providers/types.js'

const action = {
  id: 'action-1',
  demoRunId: 'demo-1',
  provider: 'BAND',
  kind: 'external-agents.negotiate',
  idempotencyKey: 'idem-1',
  status: ProviderActionStatus.PLANNED,
  live: false,
  attempts: 0,
  request: { brief: 'Brief', currency: 'EUR', localPolicy: 'Floor EUR 158.' },
  providerExternalId: null,
  redactedResponse: null,
  lastError: null,
  runAfter: new Date(),
  createdAt: new Date(),
  updatedAt: new Date(),
}

function provider(overrides: Record<string, unknown> = {}) {
  return {
    provider: 'BAND',
    capabilities: () => ({ live: true, idempotency: 'reconcile', operations: [] }),
    preflight: vi.fn(),
    execute: vi.fn(),
    reconcile: vi.fn(),
    ...overrides,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  database.update.mockResolvedValue(action)
  database.updateMany.mockResolvedValue({ count: 1 })
})

describe('uncertain provider outcomes', () => {
  it('carry a reconciliation hint instead of inviting a blind resend', () => {
    const error = new ProviderOutcomeUnknownError('timed out after provider accepted request', 'remote-123')
    expect(error.name).toBe('ProviderOutcomeUnknownError')
    expect(error.externalHint).toBe('remote-123')
  })

  it('persists the provider hint when execution becomes uncertain', async () => {
    const band = provider({
      execute: vi.fn().mockRejectedValue(new ProviderOutcomeUnknownError('outcome unknown', 'room-1')),
    })
    database.findUniqueOrThrow.mockResolvedValue(action)

    await expect(dispatchProviderAction(action.id, new Map([['BAND', band]]) as ProviderRegistry))
      .rejects.toBeInstanceOf(ProviderReconciliationPendingError)

    expect(database.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ id: action.id, status: ProviderActionStatus.RUNNING }),
      data: expect.objectContaining({
        status: ProviderActionStatus.RECONCILE_REQUIRED,
        providerExternalId: 'room-1',
        leaseToken: null,
      }),
    }))
  })

  it('claims reconciliation once and passes the durable request plus room hint', async () => {
    const reconcilingAction = {
      ...action,
      status: ProviderActionStatus.RECONCILE_REQUIRED,
      providerExternalId: 'room-1',
    }
    const result = {
      provider: 'BAND',
      externalId: 'band:room-1',
      live: true,
      status: 'COMPLETE',
      data: { roomId: 'room-1' },
      redacted: { roomId: 'room-1' },
    }
    const band = provider({ reconcile: vi.fn().mockResolvedValue(result) })
    database.findUniqueOrThrow.mockResolvedValue(reconcilingAction)

    await expect(dispatchProviderAction(action.id, new Map([['BAND', band]]) as ProviderRegistry))
      .resolves.toEqual(result)

    expect(band.reconcile).toHaveBeenCalledWith(action.idempotencyKey, {
      demoRunId: action.demoRunId,
      idempotencyKey: action.idempotencyKey,
      payload: action.request,
      externalHint: 'room-1',
    })
    expect(database.updateMany).toHaveBeenNthCalledWith(1, expect.objectContaining({
      where: { id: action.id, status: ProviderActionStatus.RECONCILE_REQUIRED },
      data: expect.objectContaining({ status: ProviderActionStatus.RUNNING, lastError: null }),
    }))
    const claimedToken = database.updateMany.mock.calls[0]?.[0].data.leaseToken
    expect(claimedToken).toEqual(expect.any(String))
    expect(database.updateMany.mock.calls[1]?.[0].where.leaseToken).toBe(claimedToken)
  })

  it('does not enter provider reconciliation when another caller owns the claim', async () => {
    const reconcilingAction = { ...action, status: ProviderActionStatus.RECONCILE_REQUIRED }
    const band = provider()
    database.findUniqueOrThrow.mockResolvedValue(reconcilingAction)
    database.updateMany.mockResolvedValueOnce({ count: 0 })

    await expect(dispatchProviderAction(action.id, new Map([['BAND', band]]) as ProviderRegistry))
      .rejects.toBeInstanceOf(ProviderReconciliationPendingError)
    expect(band.reconcile).not.toHaveBeenCalled()
  })

  it('cannot persist a stale execution result after its lease token is superseded', async () => {
    const result = {
      provider: 'BAND',
      externalId: 'band:room-1',
      live: true,
      status: 'COMPLETE',
      data: { roomId: 'room-1' },
      redacted: { roomId: 'room-1' },
    }
    const band = provider({ execute: vi.fn().mockResolvedValue(result) })
    database.findUniqueOrThrow.mockResolvedValue(action)
    database.updateMany
      .mockResolvedValueOnce({ count: 1 })
      .mockResolvedValueOnce({ count: 0 })

    await expect(dispatchProviderAction(action.id, new Map([['BAND', band]]) as ProviderRegistry))
      .rejects.toBeInstanceOf(ProviderReconciliationPendingError)

    const claimedToken = database.updateMany.mock.calls[0]?.[0].data.leaseToken
    expect(database.updateMany.mock.calls[1]?.[0].where).toEqual(expect.objectContaining({
      id: action.id,
      status: ProviderActionStatus.RUNNING,
      leaseToken: claimedToken,
    }))
  })
})
