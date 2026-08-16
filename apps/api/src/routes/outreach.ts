import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { generateOutreachDraft } from '../domain/outreach-draft.js'

const draftRequestSchema = z.object({
  company: z.string().min(1).max(160),
  country: z.string().min(1).max(80).optional(),
  description: z.string().min(1).max(400).optional(),
  buyer: z.string().min(1).max(80).optional(),
  focus: z.string().min(1).max(160).optional(),
}).strict()

export function registerOutreachRoutes(app: FastifyInstance): void {
  app.post('/api/v1/outreach/draft', async (request) => {
    const input = draftRequestSchema.parse(request.body ?? {})
    return generateOutreachDraft(input)
  })
}
