import type { FastifyInstance } from 'fastify'
import { createDemoRunSchema, ownerDecisionSchema } from '@zero-human/contracts'
import { ApprovalDecision, ApprovalKind } from '@prisma/client'
import { requireOwner } from '../auth.js'
import { db } from '../db.js'
import { collectProof, createDemoRun, decideCampaign, getDemoRunSnapshot, latestDemoRunId } from '../domain/demo-service.js'
import { runFakeRehearsal } from '../domain/fake-run.js'
import { verifyDemoRun } from '../domain/verify.js'
import { reconcilePendingRenderTaskRuns, triggerRenderTask } from '../workflows/render-client.js'

const approvedRenderTasks = [
  'discover-research-leads',
  'send-nordlicht-outreach',
  'prove-render-retry',
] as const

async function reconciledSnapshot(demoRunId: string) {
  await reconcilePendingRenderTaskRuns(demoRunId)
  return getDemoRunSnapshot(demoRunId)
}

export function registerDemoRoutes(app: FastifyInstance): void {
  app.get('/api/v1/demo-runs/active', async (_request, reply) => {
    const id = await latestDemoRunId()
    if (!id) return reply.code(404).send({ error: 'No demo run exists yet' })
    return reconciledSnapshot(id)
  })

  app.get<{ Params: { id: string } }>('/api/v1/demo-runs/:id', async (request) => {
    return reconciledSnapshot(request.params.id)
  })

  app.get<{ Params: { id: string } }>('/api/v1/demo-runs/:id/proof', async (request) => ({
    demoRunId: request.params.id,
    proof: await collectProof(request.params.id),
  }))

  app.get<{ Params: { id: string } }>('/api/v1/demo-runs/:id/verify', async (request) => {
    await reconcilePendingRenderTaskRuns(request.params.id)
    return verifyDemoRun(request.params.id)
  })

  app.get<{ Params: { id: string } }>('/api/v1/demo-runs/:id/events', async (request, reply) => {
    reply.hijack()
    reply.raw.writeHead(200, {
      'content-type': 'text/event-stream',
      'cache-control': 'no-cache, no-transform',
      connection: 'keep-alive',
      'x-accel-buffering': 'no',
    })
    const send = async () => {
      try {
        const snapshot = await reconciledSnapshot(request.params.id)
        reply.raw.write(`event: snapshot\ndata: ${JSON.stringify(snapshot)}\n\n`)
      } catch {
        reply.raw.end()
      }
    }
    await send()
    const interval = setInterval(() => void send(), 1_500)
    request.raw.on('close', () => clearInterval(interval))
  })

  app.post('/api/v1/demo-runs', { preHandler: requireOwner }, async (request, reply) => {
    const input = createDemoRunSchema.parse(request.body ?? {})
    const id = await createDemoRun(input.mode)
    return reply.code(201).send(await getDemoRunSnapshot(id))
  })

  app.post<{ Params: { id: string } }>('/api/v1/demo-runs/:id/rehearse', { preHandler: requireOwner }, async (request) => {
    await runFakeRehearsal(request.params.id)
    return getDemoRunSnapshot(request.params.id)
  })

  app.post<{ Params: { id: string } }>('/api/v1/demo-runs/:id/campaign-decision', { preHandler: requireOwner }, async (request) => {
    const input = ownerDecisionSchema.parse(request.body)
    if (input.decision === 'APPROVE') {
      const approval = await db.approval.findUnique({
        where: { demoRunId_kind: { demoRunId: request.params.id, kind: ApprovalKind.CAMPAIGN } },
      })
      if (!approval) await decideCampaign(request.params.id, input.decision)
      else if (approval.decision !== ApprovalDecision.APPROVE) {
        throw new Error('Campaign was already rejected and cannot be approved on retry')
      }
      await Promise.all(approvedRenderTasks.map((slug) => triggerRenderTask(request.params.id, slug)))
    } else {
      await decideCampaign(request.params.id, input.decision)
    }
    return reconciledSnapshot(request.params.id)
  })
}
