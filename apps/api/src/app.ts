import { existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import Fastify from 'fastify'
import cookie from '@fastify/cookie'
import fastifyStatic from '@fastify/static'
import rawBody from 'fastify-raw-body'
import { getConfig } from './config.js'
import { registerAuthRoutes } from './auth.js'
import { openapiDocument } from './openapi.js'
import { registerDemoRoutes } from './routes/demo.js'
import { registerProviderRoutes } from './routes/providers.js'

export async function buildApp() {
  const config = getConfig()
  const app = Fastify({ logger: { redact: ['req.headers.authorization', 'req.headers.cookie', 'body.password'] } })
  await app.register(cookie, { secret: config.COOKIE_SECRET })
  await app.register(rawBody, { global: false, field: 'rawBody', encoding: 'utf8', runFirst: true })

  app.get('/healthz', async () => ({ ok: true, judgeMode: config.JUDGE_MODE }))
  app.get('/api/v1/openapi.json', async () => openapiDocument)
  registerAuthRoutes(app)
  registerDemoRoutes(app)
  registerProviderRoutes(app)

  const webRoot = fileURLToPath(new URL('../../../dist', import.meta.url))
  if (config.NODE_ENV === 'production' && existsSync(webRoot)) {
    await app.register(fastifyStatic, { root: webRoot, wildcard: false })
    app.get('/*', async (_request, reply) => reply.sendFile('index.html'))
  }
  return app
}
