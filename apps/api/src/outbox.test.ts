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
  PROVIDER_ACTION_LEASE_MS,
  ProviderReconciliationPendingError,
  reconcileProviderAction,
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
  demoRun: { workspace: { killSwitch: false } },
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

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise
    reject = rejectPromise
  })
  return { promise, resolve, reject }
}

beforeEach(() => {
  vi.clearAllMocks()
  database.update.mockResolvedValue(action)
  database.updateMany.mockResolvedValue({ count: 1 })
})

describe('workspace kill switch', () => {
  it('blocks execution without calling or claiming the provider action', async () => {
    const blockedAction = {
      ...action,
      demoRun: { workspace: { killSwitch: true } },
    }
    const band = provider()
    database.findUniqueOrThrow.mockResolvedValue(blockedAction)

    await expect(dispatchProviderAction(action.id, new Map([['BAND', band]]) as ProviderRegistry))
      .rejects.toThrow('WORKSPACE_KILL_SWITCH_ENABLED')

    expect(band.execute).not.toHaveBeenCalled()
    expect(database.updateMany).not.toHaveBeenCalled()
  })

  it('keeps execution behavior unchanged when disabled', async () => {
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

    await expect(dispatchProviderAction(action.id, new Map([['BAND', band]]) as ProviderRegistry))
      .resolves.toBe(result)

    expect(band.execute).toHaveBeenCalledTimes(1)
  })

  it('blocks reconciliation without calling or claiming the provider action', async () => {
    const blockedAction = {
      ...action,
      status: ProviderActionStatus.RECONCILE_REQUIRED,
      demoRun: { workspace: { killSwitch: true } },
    }
    const band = provider()
    database.findUniqueOrThrow.mockResolvedValue(blockedAction)

    await expect(reconcileProviderAction(action.id, new Map([['BAND', band]]) as ProviderRegistry))
      .rejects.toThrow('WORKSPACE_KILL_SWITCH_ENABLED')

    expect(band.reconcile).not.toHaveBeenCalled()
    expect(database.updateMany).not.toHaveBeenCalled()
  })

  it('keeps reconciliation behavior unchanged when disabled', async () => {
    const reconcilingAction = { ...action, status: ProviderActionStatus.RECONCILE_REQUIRED }
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

    await expect(reconcileProviderAction(action.id, new Map([['BAND', band]]) as ProviderRegistry))
      .resolves.toBe(result)

    expect(band.reconcile).toHaveBeenCalledTimes(1)
  })
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

  it('reclaims an expired running action through native idempotency', async () => {
    const now = new Date('2026-08-15T12:00:00.000Z')
    vi.useFakeTimers()
    vi.setSystemTime(now)
    const expired = {
      ...action,
      status: ProviderActionStatus.RUNNING,
      leaseToken: 'expired-lease',
      leaseExpiresAt: new Date(now.getTime() - 1),
    }
    const reconciling = {
      ...expired,
      status: ProviderActionStatus.RECONCILE_REQUIRED,
      leaseToken: null,
      leaseExpiresAt: null,
    }
    const retryable = { ...reconciling, status: ProviderActionStatus.FAILED }
    const claimed = { ...retryable, status: ProviderActionStatus.RUNNING }
    const result = {
      provider: 'BAND',
      externalId: 'band:room-1',
      live: true,
      status: 'COMPLETE',
      data: { roomId: 'room-1' },
      redacted: { roomId: 'room-1' },
    }
    const band = provider({
      capabilities: () => ({ live: true, idempotency: 'native', operations: [] }),
      execute: vi.fn().mockResolvedValue(result),
    })
    database.findUniqueOrThrow
      .mockResolvedValueOnce(expired)
      .mockResolvedValueOnce(reconciling)
      .mockResolvedValueOnce(retryable)
      .mockResolvedValueOnce(claimed)

    try {
      await expect(dispatchProviderAction(action.id, new Map([['BAND', band]]) as ProviderRegistry))
        .resolves.toEqual(result)

      expect(database.updateMany).toHaveBeenNthCalledWith(1, expect.objectContaining({
        where: expect.objectContaining({
          id: action.id,
          status: ProviderActionStatus.RUNNING,
          OR: expect.arrayContaining([{ leaseExpiresAt: { lte: now } }]),
        }),
        data: expect.objectContaining({
          status: ProviderActionStatus.RECONCILE_REQUIRED,
          leaseToken: null,
          leaseExpiresAt: null,
        }),
      }))
      expect(database.updateMany).toHaveBeenNthCalledWith(2, expect.objectContaining({
        where: { id: action.id, status: ProviderActionStatus.RECONCILE_REQUIRED },
        data: expect.objectContaining({ status: ProviderActionStatus.FAILED }),
      }))
      expect(database.updateMany.mock.calls[2]?.[0].data.leaseExpiresAt)
        .toEqual(new Date(now.getTime() + PROVIDER_ACTION_LEASE_MS))
      expect(band.execute).toHaveBeenCalledTimes(1)
      expect(band.execute).toHaveBeenCalledWith(expect.objectContaining({
        idempotencyKey: action.idempotencyKey,
      }))
    } finally {
      vi.useRealTimers()
    }
  })

  it('keeps an expired manual-idempotency action fail-closed', async () => {
    const expired = {
      ...action,
      status: ProviderActionStatus.RUNNING,
      leaseToken: 'expired-lease',
      leaseExpiresAt: new Date(Date.now() - 1),
    }
    const reconciling = {
      ...expired,
      status: ProviderActionStatus.RECONCILE_REQUIRED,
      leaseToken: null,
      leaseExpiresAt: null,
    }
    const manual = provider({
      capabilities: () => ({ live: true, idempotency: 'manual', operations: [] }),
      reconcile: undefined,
    })
    database.findUniqueOrThrow
      .mockResolvedValueOnce(expired)
      .mockResolvedValueOnce(reconciling)

    await expect(dispatchProviderAction(action.id, new Map([['BAND', manual]]) as ProviderRegistry))
      .rejects.toBeInstanceOf(ProviderReconciliationPendingError)

    expect(manual.execute).not.toHaveBeenCalled()
    expect(database.updateMany).toHaveBeenLastCalledWith(expect.objectContaining({
      where: { id: action.id, status: ProviderActionStatus.RECONCILE_REQUIRED },
      data: expect.objectContaining({ status: ProviderActionStatus.RECONCILE_REQUIRED }),
    }))
  })

  it('executes a native recovery once when two stale dispatches race', async () => {
    const reconcilingAction = { ...action, status: ProviderActionStatus.RECONCILE_REQUIRED }
    const result = {
      provider: 'BAND',
      externalId: 'band:room-1',
      live: true,
      status: 'COMPLETE',
      data: { roomId: 'room-1' },
      redacted: { roomId: 'room-1' },
    }
    const execution = deferred<typeof result>()
    const providerStarted = deferred<void>()
    const releaseLosingRecovery = deferred<void>()
    let stored = { ...reconcilingAction }
    let initialReads = 0
    let recoveryClaims = 0

    database.findUniqueOrThrow.mockImplementation(async () => {
      if (initialReads < 2) {
        initialReads += 1
        return { ...reconcilingAction }
      }
      return { ...stored }
    })
    database.updateMany.mockImplementation(async ({ where, data }) => {
      if (where.status === ProviderActionStatus.RECONCILE_REQUIRED) {
        recoveryClaims += 1
        if (recoveryClaims === 2) {
          await releaseLosingRecovery.promise
          return { count: 0 }
        }
        stored = { ...stored, ...data }
        return { count: 1 }
      }
      if (where.status?.in) {
        stored = {
          ...stored,
          ...data,
          attempts: stored.attempts + 1,
        }
        return { count: 1 }
      }
      if (
        where.status === ProviderActionStatus.RUNNING
        && where.leaseToken === stored.leaseToken
      ) {
        stored = { ...stored, ...data }
        return { count: 1 }
      }
      return { count: 0 }
    })
    const band = provider({
      capabilities: () => ({ live: true, idempotency: 'native', operations: [] }),
      execute: vi.fn().mockImplementation(async () => {
        providerStarted.resolve()
        return execution.promise
      }),
    })
    const providers = new Map([['BAND', band]]) as ProviderRegistry

    const winner = dispatchProviderAction(action.id, providers)
    const loser = dispatchProviderAction(action.id, providers)
    await providerStarted.promise

    const winningLeaseToken = stored.leaseToken
    expect(stored.status).toBe(ProviderActionStatus.RUNNING)
    expect(winningLeaseToken).toEqual(expect.any(String))

    releaseLosingRecovery.resolve()
    await expect(loser).rejects.toBeInstanceOf(ProviderReconciliationPendingError)
    expect(stored.status).toBe(ProviderActionStatus.RUNNING)
    expect(stored.leaseToken).toBe(winningLeaseToken)
    expect(band.execute).toHaveBeenCalledTimes(1)

    execution.resolve(result)
    await expect(winner).resolves.toEqual(result)
  })

  it('returns a completed action before requiring its provider registration', async () => {
    const completed = {
      ...action,
      status: ProviderActionStatus.SUCCEEDED,
      providerExternalId: 'band:room-1',
      redactedResponse: { summary: { roomId: 'room-1' }, data: { roomId: 'room-1' } },
      demoRun: { workspace: { killSwitch: true } },
    }
    database.findUniqueOrThrow.mockResolvedValue(completed)

    await expect(dispatchProviderAction(action.id, new Map()))
      .resolves.toEqual(expect.objectContaining({ externalId: 'band:room-1', status: 'COMPLETE' }))
    expect(database.updateMany).not.toHaveBeenCalled()
  })

  it('does not overwrite a running action when its provider is missing', async () => {
    const running = {
      ...action,
      status: ProviderActionStatus.RUNNING,
      leaseToken: 'active-lease',
      leaseExpiresAt: new Date(Date.now() + 60_000),
    }
    database.findUniqueOrThrow.mockResolvedValue(running)
    database.updateMany.mockResolvedValue({ count: 0 })

    await expect(dispatchProviderAction(action.id, new Map()))
      .rejects.toBeInstanceOf(ProviderReconciliationPendingError)

    expect(database.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: {
        id: action.id,
        status: { in: [ProviderActionStatus.PLANNED, ProviderActionStatus.FAILED] },
        leaseToken: null,
        leaseExpiresAt: null,
      },
    }))
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

  it('persists a stable error instead of provider secrets or PII', async () => {
    const providerError = new Error(
      'upstream rejected sk-live-supersecret for owner@example.com at +1 (415) 555-0123',
    )
    const band = provider({ execute: vi.fn().mockRejectedValue(providerError) })
    database.findUniqueOrThrow.mockResolvedValue(action)

    await expect(dispatchProviderAction(action.id, new Map([['BAND', band]]) as ProviderRegistry))
      .rejects.toBe(providerError)

    const persistedFailure = database.updateMany.mock.calls[1]?.[0].data
    expect(persistedFailure.lastError).toBe('PROVIDER_EXECUTION_FAILED')
    expect(JSON.stringify(persistedFailure)).not.toContain('sk-live-supersecret')
    expect(JSON.stringify(persistedFailure)).not.toContain('owner@example.com')
    expect(JSON.stringify(persistedFailure)).not.toContain('415')
  })

  it('persists a stable reconciliation error instead of upstream details', async () => {
    const reconcilingAction = { ...action, status: ProviderActionStatus.RECONCILE_REQUIRED }
    const providerError = new Error(
      'lookup failed for owner@example.com with token sk-live-supersecret and +1 415 555 0123',
    )
    const band = provider({ reconcile: vi.fn().mockRejectedValue(providerError) })
    database.findUniqueOrThrow.mockResolvedValue(reconcilingAction)

    await expect(dispatchProviderAction(action.id, new Map([['BAND', band]]) as ProviderRegistry))
      .rejects.toBe(providerError)

    const persistedFailure = database.updateMany.mock.calls[1]?.[0].data
    expect(persistedFailure.lastError).toBe('PROVIDER_RECONCILIATION_FAILED')
    expect(JSON.stringify(persistedFailure)).not.toContain('sk-live-supersecret')
    expect(JSON.stringify(persistedFailure)).not.toContain('owner@example.com')
    expect(JSON.stringify(persistedFailure)).not.toContain('415')
  })

  it('sanitizes nested result data while preserving workflow-readable fields', async () => {
    const result = {
      provider: 'BAND',
      externalId: 'band:room-1',
      live: true,
      status: 'COMPLETE',
      data: {
        roomId: 'room-1',
        model: 'gpt-5.6-sol',
        verdict: { recommendation: 'ACCEPT', rationale: 'Contact owner@example.com' },
        contacts: [{ phone: '+1 415 555 0123', note: 'Bearer upstream-secret-value' }],
        apiKey: 'sk-live-supersecret',
        longText: 'x'.repeat(900),
      },
      redacted: {
        roomId: 'room-1',
        model: 'gpt-5.6-sol',
        supportEmail: 'owner@example.com',
      },
    }
    const band = provider({ execute: vi.fn().mockResolvedValue(result) })
    database.findUniqueOrThrow.mockResolvedValue(action)

    await expect(dispatchProviderAction(action.id, new Map([['BAND', band]]) as ProviderRegistry))
      .resolves.toBe(result)

    const persisted = database.updateMany.mock.calls[1]?.[0].data.redactedResponse
    expect(persisted).toMatchObject({
      summary: { roomId: 'room-1', model: 'gpt-5.6-sol', supportEmail: '[REDACTED]' },
      data: {
        roomId: 'room-1',
        model: 'gpt-5.6-sol',
        verdict: { recommendation: 'ACCEPT', rationale: 'Contact [REDACTED]' },
        contacts: [{ phone: '[REDACTED]', note: '[REDACTED]' }],
        apiKey: '[REDACTED]',
      },
    })
    expect(persisted.data.longText).toHaveLength(512)
    expect(JSON.stringify(persisted)).not.toContain('sk-live-supersecret')
    expect(JSON.stringify(persisted)).not.toContain('owner@example.com')
    expect(JSON.stringify(persisted)).not.toContain('415')
  })

  it('persists only the OpenAI review decision, never generated outreach copy', async () => {
    const openAiAction = {
      ...action,
      provider: 'OPENAI',
      kind: 'structured-outreach',
    }
    const result = {
      provider: 'OPENAI',
      externalId: 'openai:response-1',
      live: true,
      status: 'COMPLETE',
      data: {
        subject: 'Private draft for owner@example.com',
        body: 'Call +1 415 555 0123 and use confidential sales copy.',
        claims: ['FSC documentation available'],
        needsHumanReview: false,
      },
      redacted: {
        responseId: 'response-1',
        model: 'gpt-5.6-luna',
        needsHumanReview: false,
      },
    }
    const openAi = provider({
      provider: 'OPENAI',
      execute: vi.fn().mockResolvedValue(result),
    })
    database.findUniqueOrThrow.mockResolvedValue(openAiAction)

    await expect(dispatchProviderAction(
      openAiAction.id,
      new Map([['OPENAI', openAi]]) as ProviderRegistry,
    )).resolves.toBe(result)

    const persisted = database.updateMany.mock.calls[1]?.[0].data.redactedResponse
    expect(persisted.data).toEqual({ needsHumanReview: false })
    expect(JSON.stringify(persisted)).not.toContain('Private draft')
    expect(JSON.stringify(persisted)).not.toContain('confidential sales copy')
    expect(JSON.stringify(persisted)).not.toContain('owner@example.com')
  })
})
