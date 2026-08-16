import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  searchBuyers: vi.fn(),
}))

vi.mock('../domain/buyer-search.js', () => ({ searchBuyers: mocks.searchBuyers }))

import { registerDiscoveryRoutes } from './discovery.js'

type TestApp = {
  posts: Record<string, { handler: (request: { body?: unknown }) => Promise<unknown> }>
  post: (path: string, handler: (request: { body?: unknown }) => Promise<unknown>) => void
}

function buildApp(): TestApp {
  const app: TestApp = {
    posts: {},
    post(path, handler) {
      this.posts[path] = { handler }
    },
  }
  registerDiscoveryRoutes(app as never)
  return app
}

describe('discovery search route', () => {
  beforeEach(() => {
    mocks.searchBuyers.mockReset()
  })

  it('forwards the Apollo search body without an owner session', async () => {
    const result = { live: true, persisted: false, demoRunId: null, added: 0, query: 'sofas', companies: [] }
    mocks.searchBuyers.mockResolvedValue(result)
    const app = buildApp()
    const route = app.posts['/api/v1/discovery/search']

    await expect(route.handler({ body: { query: 'sofas', region: 'Germany', maxResults: 5 } })).resolves.toEqual(result)
    expect(mocks.searchBuyers).toHaveBeenCalledWith({ query: 'sofas', region: 'Germany', maxResults: 5 })
  })
})
