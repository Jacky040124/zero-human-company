import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { searchBuyers } from '../domain/buyer-search.js'

const searchRequestSchema = z.object({
  query: z.string().min(1).max(240).optional(),
  region: z.string().min(1).max(80).optional(),
  buyerType: z.string().min(1).max(40).optional(),
  maxResults: z.number().int().min(1).max(25).optional(),
}).strict()

export function registerDiscoveryRoutes(app: FastifyInstance): void {
  app.post('/api/v1/discovery/search', async (request) => {
    const input = searchRequestSchema.parse(request.body ?? {})
    return searchBuyers(input)
  })
}
