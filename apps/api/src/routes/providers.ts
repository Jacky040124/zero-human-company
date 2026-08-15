import { createHash } from 'node:crypto'
import type { FastifyInstance, FastifyRequest } from 'fastify'
import { DemoRunStatus, OpportunityStage, PilotStatus, Prisma, Provider } from '@prisma/client'
import Stripe from 'stripe'
import { requireOwner } from '../auth.js'
import { getConfig } from '../config.js'
import { db } from '../db.js'
import { appendRunEvent, getDemoRunSnapshot, recordOwnerSignature, transitionOpportunity } from '../domain/demo-service.js'
import { evaluatePricePolicy } from '../domain/policy.js'
import { dispatchProviderAction } from '../outbox.js'
import { parseDocumensoWebhook } from '../providers/documenso/index.js'
import { isExplicitAcceptance, parseMaasSeatPrice, verifyLinqWebhook } from '../providers/linq/index.js'
import { createProviderRegistry } from '../providers/registry.js'
import { verifyStripeCheckoutCompleted } from '../providers/stripe/index.js'
import { triggerRenderTask } from '../workflows/render-client.js'

type RawRequest = FastifyRequest & { rawBody?: string }

function payloadHash(raw: string): string {
  return createHash('sha256').update(raw).digest('hex')
}

function header(value: string | string[] | undefined): string {
  return Array.isArray(value) ? value[0] ?? '' : value ?? ''
}

export type ProviderReceiptClaim = 'NEW' | 'RESUME' | 'DONE'

export function classifyExistingProviderReceipt(
  existing: { payloadHash: string; demoRunId: string; eventType: string; processedAt: Date | null },
  incoming: { payloadHash: string; demoRunId: string; eventType: string },
): Exclude<ProviderReceiptClaim, 'NEW'> {
  const payloadMatches = existing.payloadHash === incoming.payloadHash
  const targetMatches = existing.demoRunId === incoming.demoRunId && existing.eventType === incoming.eventType
  if (!payloadMatches || !targetMatches) {
    const error = new Error('Provider event id was reused with a different payload or target') as Error & { statusCode: number }
    error.statusCode = 409
    throw error
  }
  return existing.processedAt ? 'DONE' : 'RESUME'
}

async function claimProviderEvent(input: {
  demoRunId: string
  provider: Provider
  externalEventId: string
  eventType: string
  raw: string
}): Promise<ProviderReceiptClaim> {
  const hash = payloadHash(input.raw)
  try {
    await db.providerEvent.create({ data: { ...input, payloadHash: hash } })
    return 'NEW'
  } catch (error) {
    if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== 'P2002') throw error
    const existing = await db.providerEvent.findUniqueOrThrow({
      where: { provider_externalEventId: { provider: input.provider, externalEventId: input.externalEventId } },
    })
    return classifyExistingProviderReceipt(existing, {
      payloadHash: hash,
      demoRunId: input.demoRunId,
      eventType: input.eventType,
    })
  }
}

async function markProviderEventProcessed(provider: Provider, externalEventId: string): Promise<void> {
  await db.providerEvent.updateMany({
    where: { provider, externalEventId, processedAt: null },
    data: { processedAt: new Date() },
  })
}

async function appendRunEventOnce(
  demoRunId: string,
  event: Parameters<typeof appendRunEvent>[1],
): Promise<void> {
  if (event.proofRef) {
    const existing = await db.event.count({
      where: { demoRunId, opportunityId: event.opportunityId ?? null, type: event.type, proofRef: event.proofRef },
    })
    if (existing) return
  }
  await appendRunEvent(demoRunId, event)
}

async function ensureRenderTask(
  demoRunId: string,
  taskSlug: 'run-terac-campaign-study' | 'run-band-negotiation' | 'review-contract-and-create-envelope',
): Promise<void> {
  await triggerRenderTask(demoRunId, taskSlug)
}

async function currentOpportunityStage(opportunityId: string): Promise<OpportunityStage> {
  const opportunity = await db.opportunity.findUniqueOrThrow({ where: { id: opportunityId } })
  return opportunity.stage
}

function requireStage(stage: OpportunityStage, allowed: readonly OpportunityStage[], context: string): void {
  if (!allowed.includes(stage)) throw new Error(`${context} is invalid while opportunity is ${stage}`)
}

function requireDocumensoExternalId(eventExternalId: string, demoRunId: string, opportunityId: string): void {
  if (eventExternalId !== `documenso:${demoRunId}:${opportunityId}`) {
    throw new Error('Documenso externalId does not match the stored run and opportunity')
  }
}

export function inboundMessageBody(input: { optedOut: boolean; companyName: string; text: string }): string {
  if (input.optedOut) return 'Role-player opted out.'
  if (input.companyName === 'Maas Interiors BV') {
    const price = parseMaasSeatPrice(input.text)
    if (price === null) return 'Consenting Maas role-player replied without a verified seat price.'
    return `Consenting Maas role-player offered EUR ${price}/seat.`
  }
  const sanitized = input.text
    .replace(/[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}/g, '[email redacted]')
    .replace(/https?:\/\/\S+/gi, '[link redacted]')
    .replace(/[\u0000-\u001F\u007F]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 1_000)
  return sanitized || 'Consenting Nordlicht role-player replied without usable text.'
}

export function registerProviderRoutes(app: FastifyInstance): void {
  app.post<{ Params: { id: string } }>('/api/v1/demo-runs/:id/activate', async (request) => {
    const run = await db.demoRun.findUniqueOrThrow({ where: { id: request.params.id }, include: { workspace: { include: { pilotActivation: true } } } })
    const pilot = run.workspace.pilotActivation
    if (!pilot || run.status !== DemoRunStatus.AWAITING_PAYMENT) throw new Error('Run is not awaiting pilot payment')
    const action = await db.providerAction.upsert({
      where: { idempotencyKey: `stripe-checkout:${run.id}:${pilot.id}` },
      create: { demoRunId: run.id, provider: Provider.STRIPE, kind: 'checkout.session.create', idempotencyKey: `stripe-checkout:${run.id}:${pilot.id}`, request: { pilotActivationId: pilot.id } },
      update: {},
    })
    const result = await dispatchProviderAction(action.id, createProviderRegistry())
    const data = result.data as { checkoutUrl?: string }
    if (!data.checkoutUrl) throw new Error('Stripe returned no checkout URL')
    await db.pilotActivation.update({ where: { id: pilot.id }, data: { checkoutUrl: data.checkoutUrl } })
    return { checkoutUrl: data.checkoutUrl }
  })

  app.post('/webhooks/stripe', { config: { rawBody: true } }, async (request, reply) => {
    const config = getConfig()
    if (!config.STRIPE_SECRET_KEY || !config.STRIPE_WEBHOOK_SECRET) throw new Error('Stripe webhook is not configured')
    const raw = (request as RawRequest).rawBody ?? ''
    const signature = header(request.headers['stripe-signature'])
    const stripe = new Stripe(config.STRIPE_SECRET_KEY)
    const signed = stripe.webhooks.constructEvent(raw, signature, config.STRIPE_WEBHOOK_SECRET)
    if (signed.type !== 'checkout.session.completed') return reply.code(200).send({ received: true, ignored: true })
    const session = signed.data.object
    const demoRunId = session.metadata?.demoRunId ?? ''
    const pilotActivationId = session.metadata?.pilotActivationId ?? ''
    const proof = verifyStripeCheckoutCompleted(stripe, raw, signature, config.STRIPE_WEBHOOK_SECRET, { demoRunId, pilotActivationId }, config.STRIPE_MODE)
    const run = await db.demoRun.findUniqueOrThrow({
      where: { id: demoRunId },
      include: { workspace: { include: { pilotActivation: true } } },
    })
    if (run.workspace.pilotActivation?.id !== pilotActivationId) {
      throw new Error('Stripe metadata does not match the run pilot activation')
    }
    const claim = await claimProviderEvent({ demoRunId, provider: Provider.STRIPE, externalEventId: proof.stripeEventId, eventType: signed.type, raw })
    if (claim === 'DONE') return reply.code(200).send({ received: true, duplicate: true })

    await db.payment.upsert({
      where: { stripeEventId: proof.stripeEventId },
      create: {
        demoRunId,
        pilotActivationId,
        stripeEventId: proof.stripeEventId,
        checkoutSessionId: proof.checkoutSessionId,
        paymentIntentId: proof.paymentIntentId,
        livemode: proof.livemode,
        providerMode: proof.providerMode,
        amount: proof.amount,
        currency: proof.currency,
        status: 'COMPLETED',
      },
      update: {},
    })
    await db.pilotActivation.updateMany({
      where: { id: pilotActivationId, workspaceId: run.workspaceId, status: PilotStatus.PENDING },
      data: { status: PilotStatus.PAID, paidAt: new Date() },
    })
    await db.demoRun.updateMany({
      where: { id: demoRunId, workspaceId: run.workspaceId, status: DemoRunStatus.AWAITING_PAYMENT },
      data: { status: DemoRunStatus.STUDY_RUNNING },
    })
    await appendRunEventOnce(demoRunId, {
      type: 'payment.completed',
      status: 'PAID',
      summary: `Signed Stripe ${proof.providerMode.toLowerCase()} webhook confirmed the $5 pilot activation.`,
      actor: 'stripe',
      proofRef: proof.stripeEventId,
    })
    await ensureRenderTask(demoRunId, 'run-terac-campaign-study')
    await markProviderEventProcessed(Provider.STRIPE, proof.stripeEventId)
    return reply.code(200).send({ received: true, resumed: claim === 'RESUME' })
  })

  app.post('/webhooks/linq', { config: { rawBody: true } }, async (request, reply) => {
    const config = getConfig()
    if (!config.LINQ_WEBHOOK_SECRET) throw new Error('Linq webhook is not configured')
    const raw = (request as RawRequest).rawBody ?? ''
    const headers = Object.fromEntries(Object.entries(request.headers).map(([key, value]) => [key, header(value)]))
    const event = verifyLinqWebhook(raw, headers, config.LINQ_WEBHOOK_SECRET)
    if (event.eventType !== 'message.received') return reply.code(202).send({ received: true, ignored: true })
    if (!event.chatId || !event.messageId || !event.text || !event.senderFingerprint) {
      return reply.code(202).send({ received: true, ignored: true })
    }
    const outbound = await db.message.findFirst({
      where: { threadExternalId: event.chatId, direction: 'OUTBOUND' },
      include: { opportunity: { include: { company: true, contact: true } } },
      orderBy: { occurredAt: 'desc' },
    })
    if (!outbound) return reply.code(202).send({ received: true, unmatched: true })
    const contact = outbound.opportunity.contact
    if (!contact?.consented || !contact.rolePlayer || !contact.addressHash || contact.addressHash !== event.senderFingerprint) {
      return reply.code(202).send({ received: true, unmatched: true })
    }
    const claim = await claimProviderEvent({ demoRunId: outbound.demoRunId, provider: Provider.LINQ, externalEventId: event.eventId, eventType: event.eventType, raw })
    if (claim === 'DONE') return reply.code(200).send({ received: true, duplicate: true })
    const companyName = outbound.opportunity.company.name
    if (companyName !== 'Nordlicht Import GmbH' && companyName !== 'Maas Interiors BV') {
      throw new Error('Linq reply matched an unsupported company')
    }
    await db.message.upsert({
      where: { provider_externalId: { provider: Provider.LINQ, externalId: event.messageId } },
      create: {
        demoRunId: outbound.demoRunId,
        opportunityId: outbound.opportunityId,
        externalId: event.messageId,
        threadExternalId: event.chatId,
        direction: 'INBOUND',
        status: 'RECEIVED',
        sanitizedBody: inboundMessageBody({ optedOut: event.optedOut, companyName, text: event.text }),
        rolePlayer: true,
        live: outbound.live,
      },
      update: {},
    })
    let stage = await currentOpportunityStage(outbound.opportunityId)
    if (event.optedOut) {
      if (stage !== OpportunityStage.LOST) {
        requireStage(stage, [OpportunityStage.OUTREACH, OpportunityStage.ENGAGED, OpportunityStage.NEGOTIATING, OpportunityStage.AGREEMENT, OpportunityStage.SIGNING], 'Linq opt-out')
        await transitionOpportunity({ opportunityId: outbound.opportunityId, to: 'LOST', reason: 'OPT_OUT', eventType: 'contact.opted_out', summary: 'Role-player opted out; all outreach stopped.', actor: 'linq', proofRef: event.eventId })
      }
    } else if (companyName === 'Maas Interiors BV') {
      const offeredPrice = parseMaasSeatPrice(event.text)
      if (offeredPrice !== null) {
        const decision = evaluatePricePolicy({ offeredPrice, floorPrice: 158, currency: 'EUR', unit: 'seat' })
        if (decision.outcome === 'PAUSE' && stage !== OpportunityStage.PAUSED) {
          requireStage(stage, [OpportunityStage.OUTREACH], 'Maas price-policy reply')
          await transitionOpportunity({ opportunityId: outbound.opportunityId, to: 'PAUSED', reason: decision.reason, eventType: 'policy.blocked', summary: `${decision.summary}; no reply was sent.`, actor: 'policy-engine', proofRef: event.eventId })
        }
      }
    } else if (stage === OpportunityStage.OUTREACH) {
      await transitionOpportunity({ opportunityId: outbound.opportunityId, to: 'ENGAGED', eventType: 'reply.received', summary: 'The consenting Nordlicht role-player replied.', actor: 'linq', proofRef: event.eventId })
      stage = OpportunityStage.ENGAGED
    } else if (stage === OpportunityStage.NEGOTIATING && isExplicitAcceptance(event.text)) {
      await transitionOpportunity({ opportunityId: outbound.opportunityId, to: 'AGREEMENT', eventType: 'agreement.accepted', summary: 'The consenting Nordlicht role-player explicitly accepted.', actor: 'linq', proofRef: event.eventId })
      stage = OpportunityStage.AGREEMENT
    }
    if (!event.optedOut && companyName === 'Nordlicht Import GmbH' && stage === OpportunityStage.ENGAGED) {
      await ensureRenderTask(outbound.demoRunId, 'run-band-negotiation')
    }
    if (!event.optedOut && companyName === 'Nordlicht Import GmbH' && stage === OpportunityStage.AGREEMENT && isExplicitAcceptance(event.text)) {
      await ensureRenderTask(outbound.demoRunId, 'review-contract-and-create-envelope')
    }
    await markProviderEventProcessed(Provider.LINQ, event.eventId)
    return reply.code(200).send({ received: true, resumed: claim === 'RESUME' })
  })

  app.post('/webhooks/documenso', async (request, reply) => {
    const config = getConfig()
    if (!config.DOCUMENSO_WEBHOOK_SECRET) throw new Error('Documenso webhook is not configured')
    const event = parseDocumensoWebhook({ headers: request.headers, body: request.body }, config.DOCUMENSO_WEBHOOK_SECRET)
    if (!event) return reply.code(202).send({ received: true, ignored: true })
    const document = await db.document.findUniqueOrThrow({
      where: { provider_externalId: { provider: Provider.DOCUMENSO, externalId: event.documentId } },
      include: { opportunity: true, demoRun: true },
    })
    if (document.opportunityId !== document.opportunity.id || document.demoRunId !== document.opportunity.demoRunId) {
      throw new Error('Documenso document does not match its stored run and opportunity')
    }
    requireDocumensoExternalId(event.externalId, document.demoRunId, document.opportunityId)
    const raw = JSON.stringify(request.body)
    const externalEventId = `${event.documentId}:${event.type}:${event.occurredAt}`
    const claim = await claimProviderEvent({ demoRunId: document.demoRunId, provider: Provider.DOCUMENSO, externalEventId, eventType: event.type, raw })
    if (claim === 'DONE') return reply.code(200).send({ received: true, duplicate: true })
    if (event.type === 'OWNER_SIGNED') {
      if (!document.ownerSignedAt) {
        requireStage(document.opportunity.stage, [OpportunityStage.SIGNING], 'Owner signature')
        if (document.demoRun.status !== DemoRunStatus.AWAITING_OWNER_SIGNATURE) {
          throw new Error(`Owner signature is invalid while run is ${document.demoRun.status}`)
        }
      }
      await recordOwnerSignature(document.demoRunId)
      await db.document.updateMany({
        where: { id: document.id, demoRunId: document.demoRunId, opportunityId: document.opportunityId, ownerSignedAt: null },
        data: { ownerSignedAt: new Date(event.occurredAt), status: 'OWNER_SIGNED' },
      })
      await appendRunEventOnce(document.demoRunId, { opportunityId: document.opportunityId, type: 'owner.signed', status: 'SIGNING', summary: 'Owner action 2 completed in Documenso; awaiting the buyer role-player.', actor: 'owner-via-documenso', proofRef: externalEventId })
    } else {
      const current = await db.document.findUniqueOrThrow({ where: { id: document.id } })
      if (!current.ownerSignedAt) throw new Error('Documenso completed before the required owner-first signature')
      const stage = await currentOpportunityStage(document.opportunityId)
      requireStage(stage, [OpportunityStage.SIGNING, OpportunityStage.SIGNED], 'Document completion')
      if (document.demoRun.status !== DemoRunStatus.AWAITING_OWNER_SIGNATURE && document.demoRun.status !== DemoRunStatus.COMPLETE) {
        throw new Error(`Document completion is invalid while run is ${document.demoRun.status}`)
      }
      await db.document.updateMany({
        where: { id: document.id, demoRunId: document.demoRunId, opportunityId: document.opportunityId, completedAt: null },
        data: { buyerSignedAt: new Date(event.occurredAt), completedAt: new Date(event.occurredAt), status: 'COMPLETED' },
      })
      if (stage !== OpportunityStage.SIGNED) {
        await transitionOpportunity({ opportunityId: document.opportunityId, to: 'SIGNED', eventType: 'document.completed', summary: 'Buyer role-player signed second; Documenso marked the agreement complete.', actor: 'documenso', proofRef: externalEventId })
      }
      await db.demoRun.updateMany({
        where: { id: document.demoRunId, status: { in: [DemoRunStatus.AWAITING_OWNER_SIGNATURE, DemoRunStatus.COMPLETE] } },
        data: { status: DemoRunStatus.COMPLETE, completedAt: new Date(event.occurredAt) },
      })
    }
    await markProviderEventProcessed(Provider.DOCUMENSO, externalEventId)
    return reply.code(200).send({ received: true, resumed: claim === 'RESUME' })
  })

  app.post<{ Params: { id: string; slug: string } }>('/api/v1/demo-runs/:id/tasks/:slug', { preHandler: requireOwner }, async (request) => {
    const allowed = ['run-terac-campaign-study', 'discover-research-leads', 'send-nordlicht-outreach', 'run-band-negotiation', 'review-contract-and-create-envelope', 'prove-render-retry'] as const
    if (!allowed.includes(request.params.slug as typeof allowed[number])) throw new Error('Unknown workflow task')
    const taskRunId = await triggerRenderTask(request.params.id, request.params.slug as typeof allowed[number])
    return { taskRunId, snapshot: await getDemoRunSnapshot(request.params.id) }
  })
}
