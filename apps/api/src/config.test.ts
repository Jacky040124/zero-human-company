import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('./env.js', () => ({}))

const authKeys = ['COOKIE_SECRET', 'OWNER_EMAIL', 'OWNER_PASSWORD'] as const
const originalEnv = Object.fromEntries(
  ['NODE_ENV', ...authKeys].map((key) => [key, process.env[key]]),
)

async function readConfig() {
  vi.resetModules()
  const { getConfig } = await import('./config.js')
  return getConfig()
}

beforeEach(() => {
  process.env.NODE_ENV = 'production'
  delete process.env.COOKIE_SECRET
  delete process.env.OWNER_EMAIL
  delete process.env.OWNER_PASSWORD
})

afterEach(() => {
  for (const [key, value] of Object.entries(originalEnv)) {
    if (value === undefined) delete process.env[key]
    else process.env[key] = value
  }
})

describe('production owner authentication configuration', () => {
  it('keeps local authentication defaults available in development', async () => {
    process.env.NODE_ENV = 'development'

    await expect(readConfig()).resolves.toMatchObject({
      COOKIE_SECRET: 'local-only-cookie-secret-change-me',
      OWNER_EMAIL: 'owner@example.com',
      OWNER_PASSWORD: 'local-owner-password',
    })
  })

  it('rejects missing production credentials instead of using local defaults', async () => {
    await expect(readConfig()).rejects.toThrow(/COOKIE_SECRET must be explicitly configured/)
  })

  it.each([
    ['COOKIE_SECRET', 'local-only-cookie-secret-change-me'],
    ['COOKIE_SECRET', 'replace-with-at-least-32-random-characters'],
    ['OWNER_EMAIL', 'owner@example.com'],
    ['OWNER_PASSWORD', 'local-owner-password'],
    ['OWNER_PASSWORD', 'replace-me'],
  ] as const)('rejects the local %s default in production', async (key, localDefault) => {
    process.env.COOKIE_SECRET = 'production-cookie-secret-at-least-32-characters'
    process.env.OWNER_EMAIL = 'production-owner@example.test'
    process.env.OWNER_PASSWORD = 'production-owner-password'
    process.env[key] = localDefault

    await expect(readConfig()).rejects.toThrow(new RegExp(`${key} must be explicitly configured`))
  })
})
