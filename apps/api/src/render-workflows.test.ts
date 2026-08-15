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

import { runBandNegotiationTask } from './render-workflows.js'

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
})
