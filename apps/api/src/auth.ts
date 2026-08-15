import { createHash, timingSafeEqual } from 'node:crypto'
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'
import { getConfig } from './config.js'

const cookieName = 'zhc_owner'

function safeEqual(left: string, right: string): boolean {
  const leftHash = createHash('sha256').update(left).digest()
  const rightHash = createHash('sha256').update(right).digest()
  return timingSafeEqual(leftHash, rightHash)
}

export function registerAuthRoutes(app: FastifyInstance): void {
  app.post('/api/v1/auth/login', async (request, reply) => {
    const body = request.body as { email?: string; password?: string }
    const config = getConfig()
    if (!body || !safeEqual(body.email ?? '', config.OWNER_EMAIL) || !safeEqual(body.password ?? '', config.OWNER_PASSWORD)) {
      return reply.code(401).send({ error: 'Invalid owner credentials' })
    }
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
