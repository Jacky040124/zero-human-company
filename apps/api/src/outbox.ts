import { ProviderActionStatus, type Prisma } from '@prisma/client'
import { randomUUID } from 'node:crypto'
import { db } from './db.js'
import type { ProviderPort, ProviderResult } from './providers/types.js'
import { ProviderOutcomeUnknownError } from './providers/types.js'

export type ProviderRegistry = Map<string, ProviderPort<any, any>>
// Render kills a Workflow task after five minutes. Keep the durable lease well
// beyond that hard limit so a replacement cannot overlap the terminated task's
// external side effects; the token still fences any late database write.
export const PROVIDER_ACTION_LEASE_MS = 15 * 60 * 1_000

function newProviderActionLease(): { token: string; expiresAt: Date } {
  return {
    token: randomUUID(),
    expiresAt: new Date(Date.now() + PROVIDER_ACTION_LEASE_MS),
  }
}

export class ProviderReconciliationPendingError extends Error {
  constructor(readonly actionId: string, message = 'Provider action requires reconciliation before it can continue') {
    super(message)
    this.name = 'ProviderReconciliationPendingError'
  }
}

export async function dispatchProviderAction(actionId: string, providers: ProviderRegistry): Promise<ProviderResult> {
  let existing = await db.providerAction.findUniqueOrThrow({ where: { id: actionId } })
  const provider = providers.get(existing.provider)
  if (!provider) {
    await db.providerAction.update({ where: { id: existing.id }, data: { status: ProviderActionStatus.FAILED, lastError: `No ${existing.provider} provider registered` } })
    throw new Error(`No ${existing.provider} provider registered`)
  }
  if (existing.status === ProviderActionStatus.SUCCEEDED) {
    const result = storedResult(existing)
    if (!result) throw new ProviderReconciliationPendingError(existing.id, 'Stored provider result is incomplete')
    return result
  }
  if (existing.status === ProviderActionStatus.RUNNING) {
    const reclaimed = await db.providerAction.updateMany({
      where: {
        id: existing.id,
        status: ProviderActionStatus.RUNNING,
        OR: [
          { leaseExpiresAt: { lte: new Date() } },
          { leaseExpiresAt: null },
        ],
      },
      data: {
        status: ProviderActionStatus.RECONCILE_REQUIRED,
        lastError: 'Recovering an expired provider-action lease through reconciliation',
        leaseToken: null,
        leaseExpiresAt: null,
      },
    })
    if (reclaimed.count !== 1) {
      throw new ProviderReconciliationPendingError(existing.id, 'Provider action is already being processed')
    }
    existing = await db.providerAction.findUniqueOrThrow({ where: { id: actionId } })
  }
  if (existing.status === ProviderActionStatus.RECONCILE_REQUIRED) {
    if (provider.capabilities().idempotency === 'native') {
      await db.providerAction.update({ where: { id: existing.id }, data: { status: ProviderActionStatus.FAILED, lastError: 'Recovering interrupted native-idempotency action with the same key' } })
    } else if (provider.reconcile) {
      const reconciled = await reconcileProviderAction(existing.id, providers)
      if (reconciled) return reconciled
      throw new ProviderReconciliationPendingError(existing.id)
    } else {
      await db.providerAction.update({ where: { id: existing.id }, data: { status: ProviderActionStatus.RECONCILE_REQUIRED, lastError: 'Interrupted action requires manual reconciliation' } })
      throw new ProviderReconciliationPendingError(existing.id, 'Interrupted provider action requires manual reconciliation')
    }
    existing = await db.providerAction.findUniqueOrThrow({ where: { id: actionId } })
  }
  const executionLease = newProviderActionLease()
  const claimed = await db.providerAction.updateMany({
    where: { id: actionId, status: { in: [ProviderActionStatus.PLANNED, ProviderActionStatus.FAILED] } },
    data: {
      status: ProviderActionStatus.RUNNING,
      attempts: { increment: 1 },
      lastError: null,
      leaseToken: executionLease.token,
      leaseExpiresAt: executionLease.expiresAt,
    },
  })
  if (claimed.count !== 1) {
    const current = await db.providerAction.findUniqueOrThrow({ where: { id: actionId } })
    if (current.status === ProviderActionStatus.SUCCEEDED) {
      const result = storedResult(current)
      if (result) return result
    }
    throw new ProviderReconciliationPendingError(actionId, 'Provider action is already being processed')
  }
  const action = await db.providerAction.findUniqueOrThrow({ where: { id: actionId } })
  let result: ProviderResult
  try {
    result = await provider.execute({
      demoRunId: action.demoRunId,
      idempotencyKey: action.idempotencyKey,
      payload: action.request as unknown,
    })
  } catch (error) {
    const unknown = error instanceof ProviderOutcomeUnknownError
    const released = await db.providerAction.updateMany({
      where: {
        id: action.id,
        status: ProviderActionStatus.RUNNING,
        leaseToken: executionLease.token,
      },
      data: {
        status: unknown ? ProviderActionStatus.RECONCILE_REQUIRED : ProviderActionStatus.FAILED,
        lastError: error instanceof Error ? error.message : 'Unknown provider error',
        leaseToken: null,
        leaseExpiresAt: null,
        ...(unknown && error.externalHint
          ? { providerExternalId: error.externalHint.slice(0, 255) }
          : {}),
      },
    })
    if (released.count !== 1) {
      throw new ProviderReconciliationPendingError(action.id, 'Provider action lease was superseded while execution was running')
    }
    if (unknown) throw new ProviderReconciliationPendingError(action.id)
    throw error
  }

  let completed: { count: number }
  try {
    completed = await db.providerAction.updateMany({
      where: {
        id: action.id,
        status: ProviderActionStatus.RUNNING,
        leaseToken: executionLease.token,
      },
      data: {
        status: ProviderActionStatus.SUCCEEDED,
        live: result.live,
        providerExternalId: result.externalId,
        redactedResponse: { summary: result.redacted, data: result.data } as Prisma.InputJsonValue,
        leaseToken: null,
        leaseExpiresAt: null,
      },
    })
  } catch {
    // The provider succeeded but durable result storage did not. Leave the action RUNNING:
    // its next dispatch will reuse native idempotency or reconcile before any resend.
    throw new ProviderReconciliationPendingError(action.id, 'Provider completed, but durable result storage must be reconciled')
  }
  if (completed.count !== 1) {
    throw new ProviderReconciliationPendingError(action.id, 'Provider completed after its action lease was superseded')
  }
  return result
}

export async function reconcileProviderAction(actionId: string, providers: ProviderRegistry): Promise<ProviderResult | null> {
  const action = await db.providerAction.findUniqueOrThrow({ where: { id: actionId } })
  if (action.status !== ProviderActionStatus.RECONCILE_REQUIRED) return null
  const provider = providers.get(action.provider)
  if (!provider?.reconcile) return null
  const reconciliationLease = newProviderActionLease()
  const claimed = await db.providerAction.updateMany({
    where: { id: action.id, status: ProviderActionStatus.RECONCILE_REQUIRED },
    data: {
      status: ProviderActionStatus.RUNNING,
      lastError: null,
      leaseToken: reconciliationLease.token,
      leaseExpiresAt: reconciliationLease.expiresAt,
    },
  })
  if (claimed.count !== 1) {
    throw new ProviderReconciliationPendingError(action.id, 'Provider reconciliation is already being processed')
  }

  let result: ProviderResult | null
  try {
    result = await provider.reconcile(action.idempotencyKey, {
      demoRunId: action.demoRunId,
      idempotencyKey: action.idempotencyKey,
      payload: action.request as unknown,
      ...(action.providerExternalId ? { externalHint: action.providerExternalId } : {}),
    })
  } catch (error) {
    await db.providerAction.updateMany({
      where: {
        id: action.id,
        status: ProviderActionStatus.RUNNING,
        leaseToken: reconciliationLease.token,
      },
      data: {
        status: ProviderActionStatus.RECONCILE_REQUIRED,
        lastError: error instanceof Error ? error.message : 'Provider reconciliation failed',
        leaseToken: null,
        leaseExpiresAt: null,
      },
    })
    throw error
  }
  if (!result) {
    await db.providerAction.updateMany({
      where: {
        id: action.id,
        status: ProviderActionStatus.RUNNING,
        leaseToken: reconciliationLease.token,
      },
      data: {
        status: ProviderActionStatus.RECONCILE_REQUIRED,
        lastError: 'Provider outcome is not visible yet',
        leaseToken: null,
        leaseExpiresAt: null,
      },
    })
    return null
  }
  const completed = await db.providerAction.updateMany({
    where: {
      id: action.id,
      status: ProviderActionStatus.RUNNING,
      leaseToken: reconciliationLease.token,
    },
    data: {
      status: ProviderActionStatus.SUCCEEDED,
      live: result.live,
      providerExternalId: result.externalId,
      redactedResponse: { summary: result.redacted, data: result.data } as Prisma.InputJsonValue,
      lastError: null,
      leaseToken: null,
      leaseExpiresAt: null,
    },
  })
  if (completed.count !== 1) {
    throw new ProviderReconciliationPendingError(action.id, 'Provider reconciled, but its durable result was not claimed')
  }
  return result
}

function storedResult(action: {
  provider: string
  providerExternalId: string | null
  live: boolean
  redactedResponse: Prisma.JsonValue | null
}): ProviderResult | null {
  if (!action.providerExternalId || !action.redactedResponse || typeof action.redactedResponse !== 'object' || Array.isArray(action.redactedResponse)) return null
  const stored = action.redactedResponse as Record<string, unknown>
  return {
    provider: action.provider as ProviderResult['provider'],
    externalId: action.providerExternalId,
    live: action.live,
    status: 'COMPLETE',
    data: (stored.data && typeof stored.data === 'object' ? stored.data : {}) as Record<string, unknown>,
    redacted: (stored.summary && typeof stored.summary === 'object' ? stored.summary : {}) as Record<string, unknown>,
  }
}
