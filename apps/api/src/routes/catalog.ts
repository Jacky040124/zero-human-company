import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { httpError, toPublicHttpError } from '../http-errors.js'
import { extractCatalog } from '../providers/pioneer/index.js'

const CATALOG_BODY_LIMIT = 40 * 1024 * 1024

const extractRequestSchema = z.object({
  text: z.string().optional(),
  pdfBase64: z.string().optional(),
  filename: z.string().optional(),
  threshold: z.number().optional(),
})

function writeSse(reply: { raw: { write: (chunk: string) => boolean } }, event: string, data: unknown) {
  reply.raw.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)
}

export function registerCatalogRoutes(app: FastifyInstance): void {
  app.post('/api/v1/catalog/extract', { bodyLimit: CATALOG_BODY_LIMIT }, async (request, reply) => {
    const input = extractRequestSchema.parse(request.body ?? {})
    const text = input.text?.trim() ?? ''
    const pdfBase64 = input.pdfBase64?.trim() ?? ''
    if (!text && !pdfBase64) {
      throw httpError(400, 'Provide text or pdfBase64')
    }
    reply.hijack()
    reply.raw.writeHead(200, {
      'content-type': 'text/event-stream',
      'cache-control': 'no-cache, no-transform',
      connection: 'keep-alive',
      'x-accel-buffering': 'no',
    })

    const started = Date.now()
    let closed = false
    request.raw.on('close', () => {
      closed = true
    })
    writeSse(reply, 'start', { chunkCount: 4 })

    try {
      const result = await extractCatalog(
        [text || pdfBase64 || 'mock'],
        0.5,
        undefined,
        (chunk) => {
          if (!closed) writeSse(reply, 'chunk', chunk)
        },
      )
      if (!closed) {
        writeSse(reply, 'done', { ...result, elapsedMs: Date.now() - started })
      }
    } catch (error) {
      request.log.error({ errorName: error instanceof Error ? error.name : 'UnknownError' }, 'catalog extract failed')
      if (!closed) writeSse(reply, 'error', toPublicHttpError(error).body)
    } finally {
      if (!closed) reply.raw.end()
    }
  })
}
