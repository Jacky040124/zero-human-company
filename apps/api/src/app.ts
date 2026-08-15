import { existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import Fastify from 'fastify'
import cookie from '@fastify/cookie'
import fastifyStatic from '@fastify/static'
import rawBody from 'fastify-raw-body'
import { getConfig } from './config.js'
import { registerAuthRoutes } from './auth.js'
import { toPublicHttpError } from './http-errors.js'
import { openapiDocument } from './openapi.js'
import { registerDemoRoutes } from './routes/demo.js'
import { registerProviderRoutes } from './routes/providers.js'

interface BuildAppOptions {
  webRoot?: string
}

function isBackendPath(url: string): boolean {
  const pathname = url.split('?', 1)[0]
  return pathname === '/api'
    || pathname.startsWith('/api/')
    || pathname === '/webhooks'
    || pathname.startsWith('/webhooks/')
}

export async function buildApp(options: BuildAppOptions = {}) {
  const config = getConfig()
  const app = Fastify({ logger: { redact: ['req.headers.authorization', 'req.headers.cookie', 'body.password'] } })
  await app.register(cookie, { secret: config.COOKIE_SECRET })
  await app.register(rawBody, { global: false, field: 'rawBody', encoding: 'utf8', runFirst: true })

  app.setErrorHandler((error, request, reply) => {
    const publicError = toPublicHttpError(error)
    const errorName = error instanceof Error ? error.name : 'UnknownError'
    request.log.error({ errorName, statusCode: publicError.statusCode }, 'request failed')
    return reply.code(publicError.statusCode).send(publicError.body)
  })
  app.setNotFoundHandler((_request, reply) => reply.code(404).send({ error: 'Not found' }))

  app.get('/healthz', async () => ({ ok: true, judgeMode: config.JUDGE_MODE }))
  app.get('/api/v1/openapi.json', async () => openapiDocument)
  registerAuthRoutes(app)
  registerDemoRoutes(app)
  registerProviderRoutes(app)

  const webRoot = options.webRoot ?? fileURLToPath(new URL('../../../dist', import.meta.url))
  if (config.NODE_ENV === 'production' && existsSync(webRoot)) {
    await app.register(fastifyStatic, { root: webRoot, wildcard: false })
    app.get('/*', async (request, reply) => {
      if (isBackendPath(request.url)) {
        return reply.code(404).send({ error: 'Not found' })
      }
      return reply.sendFile('index.html')
    })
  }
  return app
}
