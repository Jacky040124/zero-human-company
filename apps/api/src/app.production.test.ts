import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

let app: FastifyInstance
let webRoot: string

beforeAll(async () => {
  process.env.NODE_ENV = 'production'
  process.env.COOKIE_SECRET = 'test-cookie-secret-at-least-32-characters'
  process.env.OWNER_EMAIL = 'owner@example.test'
  process.env.OWNER_PASSWORD = 'test-owner-password'
  process.env.PROVIDER_MODE = 'fake'
  process.env.JUDGE_MODE = 'false'
  process.env.REAL_ACTIONS_ENABLED = 'false'
  process.env.STRIPE_MODE = 'TEST'

  webRoot = await mkdtemp(join(tmpdir(), 'zero-human-spa-'))
  await writeFile(join(webRoot, 'index.html'), '<!doctype html><html><body>Zero Human UI</body></html>')

  vi.resetModules()
  const module = await import('./app.js')
  app = await module.buildApp({ webRoot })
})

afterAll(async () => {
  await app.close()
  await rm(webRoot, { recursive: true, force: true })
})

describe('production SPA fallback', () => {
  it.each(['/api/v1/not-a-route', '/webhooks/not-a-provider'])(
    'keeps unknown backend path %s on the sanitized JSON 404',
    async (url) => {
      const response = await app.inject({ method: 'GET', url })

      expect(response.statusCode).toBe(404)
      expect(response.headers['content-type']).toContain('application/json')
      expect(response.json()).toEqual({ error: 'Not found' })
    },
  )

  it.each([
    '/%61pi',
    '/%61pi/v1/not-a-route',
    '/api%2Fv1%2Fnot-a-route',
    '/%77ebhooks',
    '/%77ebhooks/not-a-provider',
    '/webhooks%2Fnot-a-provider',
  ])('keeps encoded backend path %s on the sanitized JSON 404', async (url) => {
    const response = await app.inject({ method: 'GET', url })

    expect(response.statusCode).toBe(404)
    expect(response.headers['content-type']).toContain('application/json')
    expect(response.json()).toEqual({ error: 'Not found' })
  })

  it.each(['/%', '/%E0%A4%A'])(
    'fails closed with a sanitized JSON 400 for malformed path encoding %s',
    async (url) => {
      const response = await app.inject({ method: 'GET', url })

      expect(response.statusCode).toBe(400)
      expect(response.headers['content-type']).toContain('application/json')
      expect(response.json()).toEqual({ error: 'Bad Request' })
    },
  )

  it('serves the SPA shell for a UI deep link', async () => {
    const response = await app.inject({ method: 'GET', url: '/opportunities/example' })

    expect(response.statusCode).toBe(200)
    expect(response.headers['content-type']).toContain('text/html')
    expect(response.body).toContain('Zero Human UI')
  })
})
