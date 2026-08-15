import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  executeWorkflowTask: vi.fn(async () => undefined),
  registry: new Map(),
}))

vi.mock('@renderinc/sdk/workflows', () => ({
  task: vi.fn((config: unknown, handler: (demoRunId: string) => Promise<unknown>) => ({ config, handler })),
}))
vi.mock('./db.js', () => ({ db: {} }))
vi.mock('./providers/registry.js', () => ({ createProviderRegistry: () => mocks.registry }))
vi.mock('./workflows/tasks.js', () => ({ executeWorkflowTask: mocks.executeWorkflowTask }))

import { PROVIDER_ACTION_LEASE_MS } from './outbox.js'
import {
  discoverResearchLeadsTask,
  proveRenderRetryTask,
  RENDER_WORKFLOW_RETRY_WAIT_MS,
  RENDER_WORKFLOW_TIMEOUT_SECONDS,
  reviewContractAndCreateEnvelopeTask,
  runBandNegotiationTask,
  runTeracCampaignStudyTask,
  sendNordlichtOutreachTask,
} from './render-workflows.js'

describe('Render Band workflow boundary', () => {
  beforeEach(() => vi.clearAllMocks())

  it('stops after sending the proposal and waits for explicit buyer acceptance', async () => {
    const task = runBandNegotiationTask as unknown as {
      handler: (demoRunId: string) => Promise<unknown>
    }

    await task.handler('demo-1')

    expect(mocks.executeWorkflowTask).toHaveBeenCalledTimes(1)
    expect(mocks.executeWorkflowTask).toHaveBeenCalledWith(
      'run-band-negotiation',
      'demo-1',
      mocks.registry,
    )
    expect(mocks.executeWorkflowTask).not.toHaveBeenCalledWith(
      'review-contract-and-create-envelope',
      expect.anything(),
      expect.anything(),
    )
  })

  it('waits until the provider lease expires before retrying normal workflows', () => {
    const normalTasks = [
      runTeracCampaignStudyTask,
      discoverResearchLeadsTask,
      sendNordlichtOutreachTask,
      runBandNegotiationTask,
      reviewContractAndCreateEnvelopeTask,
    ] as unknown as Array<{
      config: {
        retry: { waitDurationMs: number }
        timeoutSeconds: number
      }
    }>

    expect(RENDER_WORKFLOW_RETRY_WAIT_MS).toBeGreaterThan(PROVIDER_ACTION_LEASE_MS)
    expect(PROVIDER_ACTION_LEASE_MS).toBeGreaterThan(RENDER_WORKFLOW_TIMEOUT_SECONDS * 1_000)
    for (const workflowTask of normalTasks) {
      expect(workflowTask.config.retry.waitDurationMs).toBe(RENDER_WORKFLOW_RETRY_WAIT_MS)
      expect(workflowTask.config.timeoutSeconds).toBe(RENDER_WORKFLOW_TIMEOUT_SECONDS)
    }

    const proofTask = proveRenderRetryTask as unknown as {
      config: { retry: { waitDurationMs: number } }
    }
    expect(proofTask.config.retry.waitDurationMs).toBe(500)
  })
})
