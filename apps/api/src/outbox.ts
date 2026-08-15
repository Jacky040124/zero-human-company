import { ProviderActionStatus, type Prisma } from '@prisma/client'
import { db } from './db.js'
import type { ProviderPort, ProviderResult } from './providers/types.js'
import { ProviderOutcomeUnknownError } from './providers/types.js'

export type ProviderRegistry = Map<string, ProviderPort<any, any>>

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
  if (existing.status === ProviderActionStatus.RECONCILE_REQUIRED || existing.status === ProviderActionStatus.RUNNING) {
    if (provider.capabilities().idempotency === 'native') {
      await db.providerAction.update({ where: { id: existing.id }, data: { status: ProviderActionStatus.FAILED, lastError: 'Recovering interrupted native-idempotency action with the same key' } })
    } else if (provider.reconcile) {
      await db.providerAction.update({ where: { id: existing.id }, data: { status: ProviderActionStatus.RECONCILE_REQUIRED } })
      const reconciled = await reconcileProviderAction(existing.id, providers)
      if (reconciled) return reconciled
      throw new ProviderReconciliationPendingError(existing.id)
    } else {
      await db.providerAction.update({ where: { id: existing.id }, data: { status: ProviderActionStatus.RECONCILE_REQUIRED, lastError: 'Interrupted action requires manual reconciliation' } })
      throw new ProviderReconciliationPendingError(existing.id, 'Interrupted provider action requires manual reconciliation')
    }
    existing = await db.providerAction.findUniqueOrThrow({ where: { id: actionId } })
  }
  const claimed = await db.providerAction.updateMany({
    where: { id: actionId, status: { in: [ProviderActionStatus.PLANNED, ProviderActionStatus.FAILED] } },
    data: { status: ProviderActionStatus.RUNNING, attempts: { increment: 1 }, lastError: null },
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
    await db.providerAction.update({
      where: { id: action.id },
      data: {
        status: unknown ? ProviderActionStatus.RECONCILE_REQUIRED : ProviderActionStatus.FAILED,
        lastError: error instanceof Error ? error.message : 'Unknown provider error',
      },
    })
    if (unknown) throw new ProviderReconciliationPendingError(action.id)
    throw error
  }

  try {
    await db.providerAction.update({
      where: { id: action.id },
      data: {
        status: ProviderActionStatus.SUCCEEDED,
        live: result.live,
        providerExternalId: result.externalId,
        redactedResponse: { summary: result.redacted, data: result.data } as Prisma.InputJsonValue,
      },
    })
  } catch {
    // The provider succeeded but durable result storage did not. Leave the action RUNNING:
    // its next dispatch will reuse native idempotency or reconcile before any resend.
    throw new ProviderReconciliationPendingError(action.id, 'Provider completed, but durable result storage must be reconciled')
  }
  return result
}

export async function reconcileProviderAction(actionId: string, providers: ProviderRegistry): Promise<ProviderResult | null> {
  const action = await db.providerAction.findUniqueOrThrow({ where: { id: actionId } })
  if (action.status !== ProviderActionStatus.RECONCILE_REQUIRED) return null
  const provider = providers.get(action.provider)
  if (!provider?.reconcile) return null
  const result = await provider.reconcile(action.idempotencyKey)
  if (!result) return null
  await db.providerAction.update({
    where: { id: action.id },
    data: { status: ProviderActionStatus.SUCCEEDED, live: result.live, providerExternalId: result.externalId, redactedResponse: { summary: result.redacted, data: result.data } as Prisma.InputJsonValue, lastError: null },
  })
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
