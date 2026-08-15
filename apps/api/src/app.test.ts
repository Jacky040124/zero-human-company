import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

let app: FastifyInstance

beforeAll(async () => {
  process.env.NODE_ENV = 'test'
  process.env.COOKIE_SECRET = 'test-cookie-secret-at-least-32-characters'
  process.env.OWNER_EMAIL = 'owner@example.test'
  process.env.OWNER_PASSWORD = 'test-owner-password'
  process.env.PROVIDER_MODE = 'fake'
  process.env.JUDGE_MODE = 'false'
  process.env.REAL_ACTIONS_ENABLED = 'false'
  process.env.STRIPE_MODE = 'TEST'
  vi.resetModules()
  const module = await import('./app.js')
  app = await module.buildApp()
})

afterAll(async () => {
  await app.close()
})

describe('stable API composition', () => {
  it('serves the schema-documented OpenAPI surface and a sanitized 404', async () => {
    const openapi = await app.inject({ method: 'GET', url: '/api/v1/openapi.json' })
    expect(openapi.statusCode).toBe(200)
    expect(openapi.json().components.schemas.DemoRunSnapshot).toBeDefined()

    const missing = await app.inject({ method: 'GET', url: '/api/v1/not-a-route' })
    expect(missing.statusCode).toBe(404)
    expect(missing.json()).toEqual({ error: 'Not found' })
  })

  it('creates and inspects a signed owner session', async () => {
    const login = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: { email: 'owner@example.test', password: 'test-owner-password' },
    })
    expect(login.statusCode).toBe(200)
    expect(login.json()).toEqual({ authenticated: true })
    const cookie = login.headers['set-cookie']
    expect(cookie).toBeDefined()

    const session = await app.inject({
      method: 'GET',
      url: '/api/v1/auth/session',
      headers: { cookie: String(cookie).split(';')[0] },
    })
    expect(session.json()).toEqual({ authenticated: true })
  })

  it('protects Stripe activation and campaign approval before database access', async () => {
    for (const url of [
      '/api/v1/demo-runs/not-a-run/activate',
      '/api/v1/demo-runs/not-a-run/campaign-decision',
    ]) {
      const response = await app.inject({
        method: 'POST',
        url,
        payload: url.endsWith('campaign-decision') ? { decision: 'APPROVE' } : undefined,
      })
      expect(response.statusCode).toBe(401)
      expect(response.json()).toEqual({ error: 'Owner authentication required' })
    }
  })
})
