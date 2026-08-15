import { Render } from '@renderinc/sdk'
import { RenderTaskTriggerStatus } from '@prisma/client'
import { db } from '../db.js'
import { getConfig } from '../config.js'
import type { WorkflowTaskSlug } from './tasks.js'

const taskNames: Record<WorkflowTaskSlug, string> = {
  'run-terac-campaign-study': 'runTeracCampaignStudy',
  'discover-research-leads': 'discoverResearchLeads',
  'send-nordlicht-outreach': 'sendNordlichtOutreach',
  'run-band-negotiation': 'runBandNegotiation',
  'review-contract-and-create-envelope': 'reviewContractAndCreateEnvelope',
  'prove-render-retry': 'proveRenderRetry',
}

const triggerLeaseMs = 30_000

type RenderTaskDetails = {
  id: string
  status: string
  input: unknown[] | Record<string, unknown>
  attempts?: unknown[]
  retries?: number
}

type RenderWorkflows = {
  startTask(taskSlug: string, input: unknown[]): Promise<{ taskRunId: string }>
  getTaskRun(taskRunId: string): Promise<RenderTaskDetails>
  listTaskRuns(params: { limit: number; taskSlug: string[] }): Promise<Array<{
    taskRun: { id: string; startedAt?: string }
  }>>
}

type RenderClient = { workflows: RenderWorkflows }

function configuredRenderClient(): RenderClient {
  const config = getConfig()
  if (!config.RENDER_API_KEY || !config.RENDER_WORKFLOW_SLUG) {
    throw new Error('Render workflow trigger is not configured')
  }
  return new Render({ token: config.RENDER_API_KEY, ownerId: config.RENDER_OWNER_ID }) as RenderClient
}

function renderTaskSlug(slug: WorkflowTaskSlug): string {
  const workflowSlug = getConfig().RENDER_WORKFLOW_SLUG
  if (!workflowSlug) throw new Error('Render workflow trigger is not configured')
  return `${workflowSlug}/${taskNames[slug]}`
}

function normalizedRun(details: RenderTaskDetails): { status: string; attempt: number; retried: boolean } {
  const attempt = details.attempts?.length ?? Math.max(1, (details.retries ?? 0) + 1)
  return {
    status: String(details.status).toUpperCase(),
    attempt,
    retried: attempt > 1,
  }
}

async function persistProviderRun(
  intentId: string,
  demoRunId: string,
  slug: WorkflowTaskSlug,
  externalId: string,
  details?: RenderTaskDetails,
): Promise<void> {
  const run = details ? normalizedRun(details) : { status: 'PENDING', attempt: 0, retried: false }
  await db.renderTaskIntent.update({
    where: { id: intentId },
    data: {
      externalId,
      triggerStatus: RenderTaskTriggerStatus.TRIGGERED,
      leaseExpiresAt: null,
      lastError: null,
    },
  })
  await db.workflowRun.upsert({
    where: { provider_externalId: { provider: 'RENDER', externalId } },
    create: { demoRunId, externalId, taskSlug: slug, live: true, ...run },
    update: run,
  })
}

async function discoverMatchingRun(
  render: RenderClient,
  demoRunId: string,
  slug: WorkflowTaskSlug,
): Promise<RenderTaskDetails | null> {
  const runs = await render.workflows.listTaskRuns({ limit: 100, taskSlug: [renderTaskSlug(slug)] })
  const ordered = [...runs].sort((a, b) => (a.taskRun.startedAt ?? '').localeCompare(b.taskRun.startedAt ?? ''))
  for (const candidate of ordered) {
    const details = await render.workflows.getTaskRun(candidate.taskRun.id)
    if (Array.isArray(details.input) && details.input[0] === demoRunId) return details
  }
  return null
}

async function reconcileIntent(intent: {
  id: string
  demoRunId: string
  taskSlug: string
  externalId: string
}, render: RenderClient): Promise<void> {
  try {
    const details = await render.workflows.getTaskRun(intent.externalId)
    await persistProviderRun(
      intent.id,
      intent.demoRunId,
      intent.taskSlug as WorkflowTaskSlug,
      intent.externalId,
      details,
    )
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown Render reconciliation error'
    await db.renderTaskIntent.update({ where: { id: intent.id }, data: { lastError: message } })
    throw error
  }
}

export async function reconcilePendingRenderTaskRuns(demoRunId?: string): Promise<void> {
  const [intents, legacyPendingRuns] = await Promise.all([
    db.renderTaskIntent.findMany({
      where: {
        ...(demoRunId ? { demoRunId } : {}),
        externalId: { not: null },
      },
    }),
    db.workflowRun.findMany({
      where: {
        ...(demoRunId ? { demoRunId } : {}),
        provider: 'RENDER',
        live: true,
        status: { in: ['PENDING', 'RUNNING', 'PAUSED'] },
      },
    }),
  ])

  // Prisma cannot express the WorkflowRun status join here, so select the provider-backed
  // intents and cheaply skip terminal proof rows before making SDK calls.
  const pending = [] as Array<{ id: string; demoRunId: string; taskSlug: string; externalId: string }>
  for (const intent of intents) {
    if (!intent.externalId) continue
    const proof = await db.workflowRun.findUnique({
      where: { provider_externalId: { provider: 'RENDER', externalId: intent.externalId } },
      select: { status: true },
    })
    if (!proof || ['PENDING', 'RUNNING', 'PAUSED'].includes(proof.status)) {
      pending.push({ ...intent, externalId: intent.externalId })
    }
  }
  const intentExternalIds = new Set(intents.flatMap((intent) => intent.externalId ? [intent.externalId] : []))
  const legacyOnly = legacyPendingRuns.filter((run) => !intentExternalIds.has(run.externalId))
  if (!pending.length && !legacyOnly.length) return

  let render: RenderClient
  try {
    render = configuredRenderClient()
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown Render configuration error'
    await db.renderTaskIntent.updateMany({
      where: { id: { in: pending.map((intent) => intent.id) } },
      data: { lastError: message },
    })
    return
  }

  await Promise.allSettled([
    ...pending.map((intent) => reconcileIntent(intent, render)),
    ...legacyOnly.map(async (run) => {
      const details = await render.workflows.getTaskRun(run.externalId)
      await db.workflowRun.update({
        where: { provider_externalId: { provider: 'RENDER', externalId: run.externalId } },
        data: normalizedRun(details),
      })
    }),
  ])
}

export async function triggerRenderTask(demoRunId: string, slug: WorkflowTaskSlug): Promise<string> {
  const intent = await db.renderTaskIntent.upsert({
    where: { demoRunId_taskSlug: { demoRunId, taskSlug: slug } },
    create: { demoRunId, taskSlug: slug },
    update: {},
  })
  let render: RenderClient
  try {
    render = configuredRenderClient()
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown Render configuration error'
    await db.renderTaskIntent.update({
      where: { id: intent.id },
      data: { triggerStatus: RenderTaskTriggerStatus.FAILED, lastError: message, leaseExpiresAt: null },
    })
    throw error
  }

  if (intent.externalId) {
    await reconcileIntent({ ...intent, externalId: intent.externalId }, render)
    return intent.externalId
  }

  try {
    const recovered = await discoverMatchingRun(render, demoRunId, slug)
    if (recovered) {
      await persistProviderRun(intent.id, demoRunId, slug, recovered.id, recovered)
      return recovered.id
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown Render discovery error'
    await db.renderTaskIntent.update({
      where: { id: intent.id },
      data: { triggerStatus: RenderTaskTriggerStatus.FAILED, lastError: message, leaseExpiresAt: null },
    })
    throw error
  }

  const now = new Date()
  const claimed = await db.renderTaskIntent.updateMany({
    where: {
      id: intent.id,
      externalId: null,
      OR: [
        { triggerStatus: RenderTaskTriggerStatus.PLANNED },
        {
          triggerStatus: RenderTaskTriggerStatus.FAILED,
          OR: [{ leaseExpiresAt: null }, { leaseExpiresAt: { lt: now } }],
        },
        { triggerStatus: RenderTaskTriggerStatus.TRIGGERING, leaseExpiresAt: { lt: now } },
      ],
    },
    data: {
      triggerStatus: RenderTaskTriggerStatus.TRIGGERING,
      triggerAttempts: { increment: 1 },
      leaseExpiresAt: new Date(now.getTime() + triggerLeaseMs),
      lastError: null,
    },
  })

  if (claimed.count === 0) {
    const active = await db.renderTaskIntent.findUniqueOrThrow({ where: { id: intent.id } })
    if (active.externalId) return active.externalId
    throw new Error(`Render task ${slug} is already being triggered; retry reconciliation shortly`)
  }

  // A stale lease can mean the previous caller reached Render but crashed before saving the ID.
  try {
    const recovered = await discoverMatchingRun(render, demoRunId, slug)
    if (recovered) {
      await persistProviderRun(intent.id, demoRunId, slug, recovered.id, recovered)
      return recovered.id
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown Render discovery error'
    await db.renderTaskIntent.update({
      where: { id: intent.id },
      data: { triggerStatus: RenderTaskTriggerStatus.FAILED, lastError: message, leaseExpiresAt: null },
    })
    throw error
  }

  try {
    const started = await render.workflows.startTask(renderTaskSlug(slug), [demoRunId])
    await persistProviderRun(intent.id, demoRunId, slug, started.taskRunId)
    return started.taskRunId
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown Render trigger error'
    await db.renderTaskIntent.update({
      where: { id: intent.id },
      data: {
        triggerStatus: RenderTaskTriggerStatus.FAILED,
        lastError: message,
        // A transport failure can still mean Render accepted the task. Delay a blind retry
        // long enough for listTaskRuns reconciliation to observe an eventually-visible run.
        leaseExpiresAt: new Date(Date.now() + triggerLeaseMs),
      },
    })
    throw error
  }
}
