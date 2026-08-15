import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  db: {
    renderTaskIntent: {
      upsert: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
      findUniqueOrThrow: vi.fn(),
      findMany: vi.fn(),
    },
    workflowRun: {
      upsert: vi.fn(),
      findUnique: vi.fn(),
    },
  },
  workflows: {
    startTask: vi.fn(),
    getTaskRun: vi.fn(),
    listTaskRuns: vi.fn(),
  },
}))

vi.mock('../db.js', () => ({ db: mocks.db }))
vi.mock('../config.js', () => ({
  getConfig: () => ({
    RENDER_API_KEY: 'render-key',
    RENDER_OWNER_ID: 'owner-id',
    RENDER_WORKFLOW_SLUG: 'company-workflow',
  }),
}))
vi.mock('@renderinc/sdk', () => ({
  Render: vi.fn(function Render() {
    return { workflows: mocks.workflows }
  }),
}))

import { triggerRenderTask } from './render-client.js'

const plannedIntent = {
  id: 'intent-1',
  demoRunId: 'demo-1',
  taskSlug: 'discover-research-leads',
  externalId: null,
  triggerStatus: 'PLANNED',
  triggerAttempts: 0,
  lastError: null,
  leaseExpiresAt: null,
  createdAt: new Date('2026-08-15T00:00:00Z'),
  updatedAt: new Date('2026-08-15T00:00:00Z'),
}

describe('durable Render task intent', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.db.renderTaskIntent.upsert.mockResolvedValue(plannedIntent)
    mocks.db.renderTaskIntent.update.mockResolvedValue(plannedIntent)
    mocks.db.renderTaskIntent.updateMany.mockResolvedValue({ count: 1 })
    mocks.db.workflowRun.upsert.mockResolvedValue({})
    mocks.workflows.listTaskRuns.mockResolvedValue([])
    mocks.workflows.startTask.mockResolvedValue({ taskRunId: 'render-run-1' })
  })

  it('creates the unique intent before starting the provider task', async () => {
    const order: string[] = []
    mocks.db.renderTaskIntent.upsert.mockImplementation(async () => {
      order.push('intent')
      return plannedIntent
    })
    mocks.workflows.startTask.mockImplementation(async () => {
      order.push('provider')
      return { taskRunId: 'render-run-1' }
    })

    await expect(triggerRenderTask('demo-1', 'discover-research-leads')).resolves.toBe('render-run-1')

    expect(order).toEqual(['intent', 'provider'])
    expect(mocks.db.renderTaskIntent.upsert).toHaveBeenCalledWith(expect.objectContaining({
      where: { demoRunId_taskSlug: { demoRunId: 'demo-1', taskSlug: 'discover-research-leads' } },
    }))
    expect(mocks.workflows.startTask).toHaveBeenCalledTimes(1)
  })

  it('reuses and reconciles an existing provider run without starting another', async () => {
    mocks.db.renderTaskIntent.upsert.mockResolvedValue({ ...plannedIntent, externalId: 'render-existing' })
    mocks.workflows.getTaskRun.mockResolvedValue({
      id: 'render-existing',
      status: 'completed',
      input: ['demo-1'],
      attempts: [{}, {}],
    })

    await expect(triggerRenderTask('demo-1', 'discover-research-leads')).resolves.toBe('render-existing')

    expect(mocks.workflows.startTask).not.toHaveBeenCalled()
    expect(mocks.db.workflowRun.upsert).toHaveBeenCalledWith(expect.objectContaining({
      update: { status: 'COMPLETED', attempt: 2, retried: true },
    }))
  })

  it('persists a trigger failure so a later call can retry', async () => {
    mocks.workflows.startTask.mockRejectedValueOnce(new Error('Render unavailable'))

    await expect(triggerRenderTask('demo-1', 'discover-research-leads')).rejects.toThrow('Render unavailable')
    expect(mocks.db.renderTaskIntent.update).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ triggerStatus: 'FAILED', lastError: 'Render unavailable' }),
    }))

    mocks.db.renderTaskIntent.upsert.mockResolvedValue({ ...plannedIntent, triggerStatus: 'FAILED', lastError: 'Render unavailable' })
    mocks.workflows.startTask.mockResolvedValueOnce({ taskRunId: 'render-retry' })
    await expect(triggerRenderTask('demo-1', 'discover-research-leads')).resolves.toBe('render-retry')
    expect(mocks.workflows.startTask).toHaveBeenCalledTimes(2)
  })

  it('recovers an accepted provider run after an uncertain trigger outcome', async () => {
    mocks.workflows.listTaskRuns.mockResolvedValueOnce([
      { taskRun: { id: 'render-accepted', startedAt: '2026-08-15T00:00:01Z' } },
    ])
    mocks.workflows.getTaskRun.mockResolvedValue({
      id: 'render-accepted',
      status: 'running',
      input: ['demo-1'],
      attempts: [{}],
    })

    await expect(triggerRenderTask('demo-1', 'discover-research-leads')).resolves.toBe('render-accepted')
    expect(mocks.workflows.startTask).not.toHaveBeenCalled()
  })
})
