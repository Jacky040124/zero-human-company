import { ProviderActionStatus, type Prisma, type ProviderAction } from '@prisma/client'
import { randomUUID } from 'node:crypto'
import { db } from './db.js'
import type { ProviderPort, ProviderResult } from './providers/types.js'
import { ProviderOutcomeUnknownError } from './providers/types.js'

export type ProviderRegistry = Map<string, ProviderPort<any, any>>
// Render kills a Workflow task after five minutes. Keep the durable lease past
// that hard limit, with one minute of grace, so a replacement cannot overlap
// the terminated task's external side effects. Normal retries wait longer than
// this lease; the token still fences any late database write.
export const PROVIDER_ACTION_LEASE_MS = 6 * 60 * 1_000
const MAX_DURABLE_RESULT_STRING_LENGTH = 512
const REDACTED_VALUE = '[REDACTED]'
const WORKSPACE_KILL_SWITCH_ERROR = 'WORKSPACE_KILL_SWITCH_ENABLED'

const DURABLE_ERROR = {
  providerNotRegistered: 'PROVIDER_NOT_REGISTERED',
  executionFailed: 'PROVIDER_EXECUTION_FAILED',
  outcomeUnknown: 'PROVIDER_OUTCOME_UNKNOWN',
  reconciliationFailed: 'PROVIDER_RECONCILIATION_FAILED',
} as const

const SENSITIVE_RESULT_KEY = /(secret|password|passwd|api.?key|access.?token|refresh.?token|authorization|cookie|credential|private.?key)/i
const EMAIL_VALUE = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi
const CREDENTIAL_VALUE = /\b(?:bearer\s+[^\s,;]+|(?:sk|pk|rk|api|key|token|secret)[-_][A-Z0-9._-]{8,})\b/gi
const PHONE_CANDIDATE = /(?<![A-Z0-9])\+?\d[\d(). -]{5,}\d(?![A-Z0-9])/gi

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
  const initial = await db.providerAction.findUniqueOrThrow({
    where: { id: actionId },
    include: { demoRun: { select: { workspace: { select: { killSwitch: true } } } } },
  })
  if (initial.status === ProviderActionStatus.SUCCEEDED) {
    const result = storedResult(initial)
    if (!result) throw new ProviderReconciliationPendingError(initial.id, 'Stored provider result is incomplete')
    return result
  }
  if (initial.demoRun.workspace.killSwitch) throw new Error(WORKSPACE_KILL_SWITCH_ERROR)
  let existing: ProviderAction = initial
  const provider = providers.get(existing.provider)
  if (!provider) {
    const failed = await db.providerAction.updateMany({
      where: {
        id: existing.id,
        status: { in: [ProviderActionStatus.PLANNED, ProviderActionStatus.FAILED] },
        leaseToken: null,
        leaseExpiresAt: null,
      },
      data: {
        status: ProviderActionStatus.FAILED,
        lastError: DURABLE_ERROR.providerNotRegistered,
      },
    })
    if (failed.count !== 1) return storedResultAfterLostClaim(existing.id)
    throw new Error(`No ${existing.provider} provider registered`)
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
      const recovered = await db.providerAction.updateMany({
        where: { id: existing.id, status: ProviderActionStatus.RECONCILE_REQUIRED },
        data: {
          status: ProviderActionStatus.FAILED,
          lastError: 'Recovering interrupted native-idempotency action with the same key',
        },
      })
      if (recovered.count !== 1) return storedResultAfterLostClaim(existing.id)
    } else if (provider.reconcile) {
      const reconciled = await reconcileProviderAction(existing.id, providers)
      if (reconciled) return reconciled
      throw new ProviderReconciliationPendingError(existing.id)
    } else {
      const marked = await db.providerAction.updateMany({
        where: { id: existing.id, status: ProviderActionStatus.RECONCILE_REQUIRED },
        data: {
          status: ProviderActionStatus.RECONCILE_REQUIRED,
          lastError: 'Interrupted action requires manual reconciliation',
        },
      })
      if (marked.count !== 1) return storedResultAfterLostClaim(existing.id)
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
        lastError: unknown ? DURABLE_ERROR.outcomeUnknown : DURABLE_ERROR.executionFailed,
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
        redactedResponse: durableResult(result),
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

async function storedResultAfterLostClaim(actionId: string): Promise<ProviderResult> {
  const current = await db.providerAction.findUniqueOrThrow({ where: { id: actionId } })
  if (current.status === ProviderActionStatus.SUCCEEDED) {
    const result = storedResult(current)
    if (result) return result
  }
  throw new ProviderReconciliationPendingError(actionId, 'Provider action is already being processed')
}

export async function reconcileProviderAction(actionId: string, providers: ProviderRegistry): Promise<ProviderResult | null> {
  const action = await db.providerAction.findUniqueOrThrow({
    where: { id: actionId },
    include: { demoRun: { select: { workspace: { select: { killSwitch: true } } } } },
  })
  if (action.status !== ProviderActionStatus.RECONCILE_REQUIRED) return null
  if (action.demoRun.workspace.killSwitch) throw new Error(WORKSPACE_KILL_SWITCH_ERROR)
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
        lastError: DURABLE_ERROR.reconciliationFailed,
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
      redactedResponse: durableResult(result),
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

function durableResult(result: ProviderResult): Prisma.InputJsonValue {
  const data = result.provider === 'OPENAI'
    ? {
        needsHumanReview: Boolean(
          result.data
          && typeof result.data === 'object'
          && 'needsHumanReview' in result.data
          && result.data.needsHumanReview,
        ),
      }
    : result.data
  return sanitizeDurableValue({ summary: result.redacted, data }) as Prisma.InputJsonValue
}

function sanitizeDurableValue(value: unknown, key?: string): Prisma.JsonValue {
  if (key && SENSITIVE_RESULT_KEY.test(key)) return REDACTED_VALUE
  if (typeof value === 'string') return sanitizeDurableString(value)
  if (typeof value === 'number') return Number.isFinite(value) ? value : null
  if (typeof value === 'boolean' || value === null) return value
  if (Array.isArray(value)) return value.map((item) => sanitizeDurableValue(item))
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .map(([entryKey, entryValue]) => [entryKey, sanitizeDurableValue(entryValue, entryKey)]),
    )
  }
  return null
}

function sanitizeDurableString(value: string): string {
  const redacted = value
    .replace(EMAIL_VALUE, REDACTED_VALUE)
    .replace(CREDENTIAL_VALUE, REDACTED_VALUE)
    .replace(PHONE_CANDIDATE, (candidate) => {
      const digitCount = candidate.replace(/\D/g, '').length
      return digitCount >= 10 && digitCount <= 15 ? REDACTED_VALUE : candidate
    })
  return redacted.slice(0, MAX_DURABLE_RESULT_STRING_LENGTH)
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
