import cookie from '@fastify/cookie'
import Fastify, { type FastifyInstance } from 'fastify'
import { afterEach, beforeAll, describe, expect, it } from 'vitest'
import { registerAuthRoutes } from './auth.js'

const apps: FastifyInstance[] = []

beforeAll(() => {
  process.env.NODE_ENV = 'test'
  process.env.COOKIE_SECRET = 'test-cookie-secret-at-least-32-characters'
  process.env.OWNER_EMAIL = 'owner@example.test'
  process.env.OWNER_PASSWORD = 'test-owner-password'
})

afterEach(async () => {
  await Promise.all(apps.splice(0).map((app) => app.close()))
})

async function buildAuthApp(options: Parameters<typeof registerAuthRoutes>[1] = {}) {
  const app = Fastify()
  apps.push(app)
  await app.register(cookie, { secret: process.env.COOKIE_SECRET })
  registerAuthRoutes(app, options)
  return app
}

function failedLogin(app: FastifyInstance, email: string, remoteAddress = '192.0.2.10') {
  return app.inject({
    method: 'POST',
    url: '/api/v1/auth/login',
    remoteAddress,
    payload: { email, password: 'wrong-password' },
  })
}

describe('owner login throttling', () => {
  it('returns a sanitized 429 with Retry-After after repeated failures', async () => {
    const app = await buildAuthApp({ now: () => 10_000 })

    for (let attempt = 1; attempt < 5; attempt += 1) {
      const response = await failedLogin(app, 'owner@example.test')
      expect(response.statusCode).toBe(401)
      expect(response.json()).toEqual({ error: 'Invalid owner credentials' })
    }

    const throttled = await failedLogin(app, 'owner@example.test')
    expect(throttled.statusCode).toBe(429)
    expect(throttled.headers['retry-after']).toBe('900')
    expect(throttled.json()).toEqual({ error: 'Too many login attempts' })
  })

  it('isolates failure counts by IP and account', async () => {
    const app = await buildAuthApp({ maxFailures: 2 })

    expect((await failedLogin(app, 'owner@example.test', '192.0.2.10')).statusCode).toBe(401)
    expect((await failedLogin(app, 'owner@example.test', '192.0.2.11')).statusCode).toBe(401)
    expect((await failedLogin(app, 'another@example.test', '192.0.2.10')).statusCode).toBe(401)
    expect((await failedLogin(app, 'owner@example.test', '192.0.2.10')).statusCode).toBe(429)
  })

  it('clears the matching failure count after a successful login', async () => {
    const app = await buildAuthApp({ maxFailures: 2 })

    expect((await failedLogin(app, 'owner@example.test')).statusCode).toBe(401)
    const success = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      remoteAddress: '192.0.2.10',
      payload: { email: 'owner@example.test', password: 'test-owner-password' },
    })
    expect(success.statusCode).toBe(200)
    expect((await failedLogin(app, 'owner@example.test')).statusCode).toBe(401)
  })

  it('expires old failures and caps the number of tracked pairs', async () => {
    let now = 0
    const app = await buildAuthApp({ maxFailures: 2, windowMs: 1_000, maxEntries: 2, now: () => now })

    expect((await failedLogin(app, 'first@example.test')).statusCode).toBe(401)
    expect((await failedLogin(app, 'second@example.test')).statusCode).toBe(401)
    expect((await failedLogin(app, 'third@example.test')).statusCode).toBe(401)
    expect((await failedLogin(app, 'first@example.test')).statusCode).toBe(401)

    now = 1_001
    expect((await failedLogin(app, 'first@example.test')).statusCode).toBe(401)
  })
})
