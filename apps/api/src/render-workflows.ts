import { task } from '@renderinc/sdk/workflows'
import { Provider, ProviderActionStatus } from '@prisma/client'
import { db } from './db.js'
import { createProviderRegistry } from './providers/registry.js'
import { executeWorkflowTask } from './workflows/tasks.js'

const retry = { maxRetries: 2, waitDurationMs: 1_000, backoffScaling: 1.5 }

export const runTeracCampaignStudyTask = task(
  { name: 'runTeracCampaignStudy', retry, timeoutSeconds: 300, plan: 'starter' },
  async (demoRunId: string) => executeWorkflowTask('run-terac-campaign-study', demoRunId, createProviderRegistry()),
)

export const discoverResearchLeadsTask = task(
  { name: 'discoverResearchLeads', retry, timeoutSeconds: 300, plan: 'starter' },
  async (demoRunId: string) => executeWorkflowTask('discover-research-leads', demoRunId, createProviderRegistry()),
)

export const sendNordlichtOutreachTask = task(
  { name: 'sendNordlichtOutreach', retry, timeoutSeconds: 300, plan: 'starter' },
  async (demoRunId: string) => executeWorkflowTask('send-nordlicht-outreach', demoRunId, createProviderRegistry()),
)

export const runBandNegotiationTask = task(
  { name: 'runBandNegotiation', retry, timeoutSeconds: 300, plan: 'starter' },
  async (demoRunId: string) => executeWorkflowTask('run-band-negotiation', demoRunId, createProviderRegistry()),
)

export const reviewContractAndCreateEnvelopeTask = task(
  { name: 'reviewContractAndCreateEnvelope', retry, timeoutSeconds: 300, plan: 'starter' },
  async (demoRunId: string) => executeWorkflowTask('review-contract-and-create-envelope', demoRunId, createProviderRegistry()),
)

export const proveRenderRetryTask = task(
  { name: 'proveRenderRetry', retry: { maxRetries: 1, waitDurationMs: 500, backoffScaling: 1 }, timeoutSeconds: 60, plan: 'starter' },
  async (demoRunId: string) => {
    const key = `render-fail-once:${demoRunId}`
    const marker = await db.providerAction.upsert({
      where: { idempotencyKey: key },
      create: { demoRunId, provider: Provider.RENDER, kind: 'fail-once-marker', idempotencyKey: key, status: ProviderActionStatus.RUNNING, attempts: 1, request: {} },
      update: { attempts: { increment: 1 } },
    })
    if (marker.attempts === 1) throw new Error('Intentional first-attempt failure proving Render retry behavior')
    await db.providerAction.update({ where: { id: marker.id }, data: { status: ProviderActionStatus.SUCCEEDED, providerExternalId: key, redactedResponse: { attempts: marker.attempts } } })
    return { attempts: marker.attempts, sideEffectsDuplicated: false }
  },
)
