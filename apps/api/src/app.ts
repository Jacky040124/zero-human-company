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
import { registerCatalogRoutes } from './routes/catalog.js'
import { registerDemoRoutes } from './routes/demo.js'
import { registerDiscoveryRoutes } from './routes/discovery.js'
import { registerOutreachRoutes } from './routes/outreach.js'
import { registerUserRoutes } from './routes/users.js'
import { registerProviderRoutes } from './routes/providers.js'

interface BuildAppOptions {
  webRoot?: string
}

function isBackendPath(url: string): boolean {
  const encodedPathname = url.split('?', 1)[0]
  let pathname: string
  try {
    pathname = decodeURIComponent(encodedPathname)
  } catch {
    return true
  }
  return pathname === '/api'
    || pathname.startsWith('/api/')
    || pathname === '/webhooks'
    || pathname.startsWith('/webhooks/')
}

export async function buildApp(options: BuildAppOptions = {}) {
  const config = getConfig()
  const app = Fastify({
    logger: {
      redact: [
        'req.headers.authorization',
        'req.headers.cookie',
        'req.headers.x-api-key',
        'body.password',
        'body.pdfBase64',
        'body.text',
      ],
    },
    routerOptions: {
      onBadUrl: (_path, _request, response) => {
        response.writeHead(400, { 'content-type': 'application/json; charset=utf-8' })
        response.end(JSON.stringify({ error: 'Bad Request' }))
      },
    },
  })
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
  registerCatalogRoutes(app)
  registerDemoRoutes(app)
  registerDiscoveryRoutes(app)
  registerOutreachRoutes(app)
  registerUserRoutes(app)
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
