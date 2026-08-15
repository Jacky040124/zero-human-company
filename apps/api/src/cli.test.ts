import { afterEach, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  disconnect: vi.fn(),
  latestDemoRunId: vi.fn(),
  reconcilePendingRenderTaskRuns: vi.fn(),
  verifyDemoRun: vi.fn(),
}))

vi.mock('./config.js', () => ({ getConfig: vi.fn(), missingJudgeConfig: vi.fn() }))
vi.mock('./db.js', () => ({ db: { $disconnect: mocks.disconnect } }))
vi.mock('./domain/demo-service.js', () => ({
  createDemoRun: vi.fn(),
  getDemoRunSnapshot: vi.fn(),
  latestDemoRunId: mocks.latestDemoRunId,
}))
vi.mock('./domain/fake-run.js', () => ({ runFakeRehearsal: vi.fn() }))
vi.mock('./domain/verify.js', () => ({ verifyDemoRun: mocks.verifyDemoRun }))
vi.mock('./providers/registry.js', () => ({ createProviderRegistry: vi.fn(), preflightProviders: vi.fn() }))
vi.mock('./workflows/render-client.js', () => ({
  reconcilePendingRenderTaskRuns: mocks.reconcilePendingRenderTaskRuns,
}))

const originalArgv = process.argv

afterEach(() => {
  process.argv = originalArgv
  process.exitCode = undefined
})

it('reconciles pending Render task runs before verifying a demo run', async () => {
  const order: string[] = []
  process.argv = ['node', 'cli.ts', 'verify', '--run-id', 'demo-1']
  mocks.reconcilePendingRenderTaskRuns.mockImplementation(async () => {
    order.push('reconcile')
  })
  mocks.verifyDemoRun.mockImplementation(async () => {
    order.push('verify')
    return { passed: true, checks: [] }
  })

  await import('./cli.js')

  expect(order).toEqual(['reconcile', 'verify'])
  expect(mocks.reconcilePendingRenderTaskRuns).toHaveBeenCalledWith('demo-1')
  expect(mocks.verifyDemoRun).toHaveBeenCalledWith('demo-1')
  expect(mocks.disconnect).toHaveBeenCalledOnce()
})
