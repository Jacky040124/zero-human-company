import { createHash, timingSafeEqual } from 'node:crypto'
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'
import { z } from 'zod'
import { getConfig } from './config.js'

const cookieName = 'zhc_owner'
const loginRequestSchema = z.object({
  email: z.string(),
  password: z.string(),
}).strict()

const defaultLoginThrottle = {
  maxFailures: 5,
  windowMs: 15 * 60 * 1_000,
  maxEntries: 1_000,
} as const

interface LoginThrottleOptions {
  maxFailures?: number
  windowMs?: number
  maxEntries?: number
  now?: () => number
}

interface LoginAttempt {
  failures: number
  expiresAt: number
}

class LoginThrottle {
  private readonly attempts = new Map<string, LoginAttempt>()
  private readonly maxFailures: number
  private readonly windowMs: number
  private readonly maxEntries: number
  private readonly now: () => number

  constructor(options: LoginThrottleOptions = {}) {
    this.maxFailures = options.maxFailures ?? defaultLoginThrottle.maxFailures
    this.windowMs = options.windowMs ?? defaultLoginThrottle.windowMs
    this.maxEntries = options.maxEntries ?? defaultLoginThrottle.maxEntries
    this.now = options.now ?? Date.now
  }

  recordFailure(ip: string, account: string): number | undefined {
    const now = this.now()
    this.deleteExpired(now)

    const key = this.key(ip, account)
    const previous = this.attempts.get(key)
    if (!previous && this.attempts.size >= this.maxEntries) {
      const oldestKey = this.attempts.keys().next().value
      if (oldestKey !== undefined) this.attempts.delete(oldestKey)
    }

    const next = {
      failures: (previous?.failures ?? 0) + 1,
      expiresAt: now + this.windowMs,
    }
    this.attempts.delete(key)
    this.attempts.set(key, next)

    if (next.failures < this.maxFailures) return undefined
    return Math.max(1, Math.ceil((next.expiresAt - now) / 1_000))
  }

  clear(ip: string, account: string): void {
    this.attempts.delete(this.key(ip, account))
  }

  private deleteExpired(now: number): void {
    for (const [key, attempt] of this.attempts) {
      if (attempt.expiresAt <= now) this.attempts.delete(key)
    }
  }

  private key(ip: string, account: string): string {
    const accountHash = createHash('sha256').update(account.trim().toLowerCase()).digest('hex')
    return `${ip}:${accountHash}`
  }
}

function safeEqual(left: string, right: string): boolean {
  const leftHash = createHash('sha256').update(left).digest()
  const rightHash = createHash('sha256').update(right).digest()
  return timingSafeEqual(leftHash, rightHash)
}

export function registerAuthRoutes(app: FastifyInstance, throttleOptions: LoginThrottleOptions = {}): void {
  const loginThrottle = new LoginThrottle(throttleOptions)

  app.post('/api/v1/auth/login', async (request, reply) => {
    const parsedBody = loginRequestSchema.safeParse(request.body)
    if (!parsedBody.success) {
      return reply.code(400).send({ error: 'Invalid request' })
    }

    const body = parsedBody.data
    const config = getConfig()
    const emailMatches = safeEqual(body.email, config.OWNER_EMAIL)
    const passwordMatches = safeEqual(body.password, config.OWNER_PASSWORD)
    if (!emailMatches || !passwordMatches) {
      const retryAfter = loginThrottle.recordFailure(request.ip, body.email)
      if (retryAfter !== undefined) {
        return reply.header('Retry-After', retryAfter).code(429).send({ error: 'Too many login attempts' })
      }
      return reply.code(401).send({ error: 'Invalid owner credentials' })
    }
    loginThrottle.clear(request.ip, body.email)
    reply.setCookie(cookieName, config.OWNER_EMAIL, {
      path: '/',
      httpOnly: true,
      secure: config.NODE_ENV === 'production',
      sameSite: 'strict',
      signed: true,
      maxAge: 60 * 60 * 12,
    })
    return { authenticated: true }
  })

  app.post('/api/v1/auth/logout', async (_request, reply) => {
    reply.clearCookie(cookieName, { path: '/' })
    return { authenticated: false }
  })

  app.get('/api/v1/auth/session', async (request) => ({ authenticated: isOwner(request) }))
}

export function isOwner(request: FastifyRequest): boolean {
  const value = request.cookies[cookieName]
  if (!value) return false
  const unsigned = request.unsignCookie(value)
  return unsigned.valid && safeEqual(unsigned.value ?? '', getConfig().OWNER_EMAIL)
}

export async function requireOwner(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  if (!isOwner(request)) await reply.code(401).send({ error: 'Owner authentication required' })
}
