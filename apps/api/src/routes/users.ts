import { randomBytes } from 'node:crypto'
import type { FastifyInstance, FastifyRequest } from 'fastify'
import { z } from 'zod'
import { db } from '../db.js'
import { getConfig } from '../config.js'

const USER_COOKIE = 'zhc_user'
const LINK_TTL_MS = 15 * 60 * 1_000

const magicLinkRequestSchema = z.object({
  email: z.string().email().max(160),
}).strict()

function displayName(email: string): string {
  const prefix = email.split('@')[0] ?? 'user'
  const cleaned = prefix.replace(/[._-]+/g, ' ').trim()
  return cleaned.length > 0
    ? cleaned.split(' ').map((part) => part[0]?.toUpperCase() + part.slice(1)).join(' ')
    : 'User'
}

export async function currentUser(request: FastifyRequest): Promise<{ id: string; email: string; name: string } | null> {
  const raw = request.cookies[USER_COOKIE]
  if (!raw) return null
  const unsigned = request.unsignCookie(raw)
  if (!unsigned.valid || !unsigned.value) return null
  const user = await db.appUser.findUnique({ where: { id: unsigned.value } })
  return user ? { id: user.id, email: user.email, name: user.name } : null
}

export function registerUserRoutes(app: FastifyInstance): void {
  const config = getConfig()

  app.post('/api/v1/auth/magic-link', async (request) => {
    const input = magicLinkRequestSchema.parse(request.body ?? {})
    const email = input.email.trim().toLowerCase()
    const user = await db.appUser.upsert({
      where: { email },
      create: { email, name: displayName(email) },
      update: {},
    })
    const token = randomBytes(24).toString('hex')
    await db.magicLink.create({
      data: { token, userId: user.id, expiresAt: new Date(Date.now() + LINK_TTL_MS) },
    })
    // Demo shortcut: no email provider wired up, so the link is returned
    // directly and the UI presents it as the "email".
    return { sent: true, email, link: `/api/v1/auth/magic?token=${token}` }
  })

  app.get<{ Querystring: { token?: string } }>('/api/v1/auth/magic', async (request, reply) => {
    const token = request.query.token
    if (!token) return reply.code(400).send({ error: 'Missing token' })
    const link = await db.magicLink.findUnique({ where: { token }, include: { user: true } })
    if (!link || link.usedAt || link.expiresAt.getTime() < Date.now()) {
      return reply.code(401).send({ error: 'This sign-in link is invalid or expired' })
    }
    await db.magicLink.update({ where: { id: link.id }, data: { usedAt: new Date() } })
    reply.setCookie(USER_COOKIE, link.userId, {
      path: '/',
      httpOnly: true,
      secure: config.NODE_ENV === 'production',
      sameSite: 'lax',
      signed: true,
      maxAge: 60 * 60 * 24 * 7,
    })
    return reply.redirect('/app/discovery')
  })

  app.get('/api/v1/auth/me', async (request, reply) => {
    const user = await currentUser(request)
    if (!user) return reply.code(401).send({ error: 'Not signed in' })
    return { user }
  })

  app.post('/api/v1/auth/signout', async (_request, reply) => {
    reply.clearCookie(USER_COOKIE, { path: '/' })
    return { signedOut: true }
  })
}
