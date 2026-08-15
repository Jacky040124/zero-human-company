import { DemoRunStatus, PilotStatus, Provider, ProviderActionStatus, RevisionStatus, RunMode } from '@prisma/client'
import { db } from '../db.js'
import {
  appendRunEvent,
  applyMaasPolicyBranch,
  createDemoRun,
  decideCampaign,
  recordOwnerSignature,
  transitionOpportunity,
} from './demo-service.js'

export function fakeDocumentEvidenceTimestamps(): {
  ownerSignedAt: Date
  buyerSignedAt: Date
  completedAt: Date
} {
  const baseMs = Date.parse('2026-08-15T12:00:00.000Z')
  return {
    ownerSignedAt: new Date(baseMs),
    buyerSignedAt: new Date(baseMs + 1_000),
    completedAt: new Date(baseMs + 1_000),
  }
}

export class FakeRehearsalConflictError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'FakeRehearsalConflictError'
  }
}

type FakeRehearsalTarget = {
  mode: RunMode
  status: DemoRunStatus
  eventSequence: number
  workspace: { pilotActivation: { status: PilotStatus; paidAt: Date | null } | null }
  campaign: {
    activeRevisionId: string | null
    revisions: Array<{ label: string; status: RevisionStatus }>
  }
  opportunities: Array<{ stage: string; version: number; sequence: number }>
  companies: Array<{ monidProviderId: string | null; monidLive: boolean }>
  events: Array<{ type: string }>
  _count: {
    payments: number
    humanStudies: number
    messages: number
    agentHandoffs: number
    workflowRuns: number
    renderTaskIntents: number
    documents: number
    approvals: number
    providerEvents: number
    providerActions: number
  }
}

export function assertFreshFakeRehearsalTarget(run: FakeRehearsalTarget): void {
  const revisionsAreFresh = run.campaign.activeRevisionId === null
    && run.campaign.revisions.length === 3
    && run.campaign.revisions.some((revision) => revision.label === 'Candidate B')
    && run.campaign.revisions.every((revision) => revision.status === RevisionStatus.UNDER_STUDY)
  const seededStateIsFresh = run.eventSequence === 1
    && run.events.length === 1
    && run.events[0]?.type === 'demo.created'
    && run.opportunities.length > 0
    && run.opportunities.every((opportunity) => opportunity.stage === 'RESEARCHING' && opportunity.version === 0 && opportunity.sequence === 0)
    && run.companies.length > 0
    && run.companies.every((company) => company.monidProviderId === null && !company.monidLive)
    && Object.values(run._count).every((count) => count === 0)
  const pilot = run.workspace.pilotActivation

  if (
    run.mode !== RunMode.FAKE
    || run.status !== DemoRunStatus.AWAITING_PAYMENT
    || !pilot
    || pilot.status !== PilotStatus.PENDING
    || pilot.paidAt !== null
    || !revisionsAreFresh
    || !seededStateIsFresh
  ) {
    throw new FakeRehearsalConflictError('Fake rehearsal requires a fresh FAKE demo run')
  }
}

export async function runFakeRehearsal(existingRunId?: string): Promise<string> {
  const demoRunId = existingRunId ?? await createDemoRun('FAKE')
  const run = await db.demoRun.findUniqueOrThrow({
    where: { id: demoRunId },
    include: {
      workspace: { include: { pilotActivation: true } },
      campaign: { include: { revisions: true } },
      opportunities: { select: { stage: true, version: true, sequence: true } },
      companies: { select: { monidProviderId: true, monidLive: true } },
      events: { select: { type: true } },
      _count: {
        select: {
          payments: true,
          humanStudies: true,
          messages: true,
          agentHandoffs: true,
          workflowRuns: true,
          renderTaskIntents: true,
          documents: true,
          approvals: true,
          providerEvents: true,
          providerActions: true,
        },
      },
    },
  })
  assertFreshFakeRehearsalTarget(run)
  const pilot = run.workspace.pilotActivation
  if (!pilot) throw new Error('Missing pilot activation')

  const selected = run.campaign.revisions.find((revision) => revision.label === 'Candidate B')
  if (!selected) throw new Error('Missing selected campaign fixture')

  await db.$transaction(async (tx) => {
    const claimed = await tx.demoRun.updateMany({
      where: { id: demoRunId, mode: RunMode.FAKE, status: DemoRunStatus.AWAITING_PAYMENT },
      data: { status: DemoRunStatus.STUDY_RUNNING },
    })
    if (claimed.count !== 1) {
      throw new FakeRehearsalConflictError('Fake rehearsal has already started')
    }
    const activated = await tx.pilotActivation.updateMany({
      where: { id: pilot.id, status: PilotStatus.PENDING, paidAt: null },
      data: { status: PilotStatus.PAID, paidAt: new Date() },
    })
    if (activated.count !== 1) {
      throw new FakeRehearsalConflictError('Fake rehearsal pilot is no longer pending')
    }
    await tx.payment.create({
      data: {
        demoRunId,
        pilotActivationId: pilot.id,
        stripeEventId: `evt_fake_${demoRunId}`,
        checkoutSessionId: `cs_fake_${demoRunId}`,
        paymentIntentId: `pi_fake_${demoRunId}`,
        livemode: false,
        providerMode: 'FAKE',
        amount: 500,
        currency: 'usd',
        status: 'COMPLETED',
      },
    })
  })
  await appendRunEvent(demoRunId, { type: 'payment.completed', status: 'PAID', summary: 'Local rehearsal payment completed.', actor: 'fake-stripe', proofRef: `evt_fake_${demoRunId}` })

  await db.$transaction([
    db.humanStudy.create({
      data: {
        demoRunId,
        externalId: `terac_fake_${demoRunId}`,
        live: false,
        status: 'COMPLETE',
        baselineScore: 2.1,
        selectedScore: 4.6,
        scoreDelta: 2.5,
        rubric: { clarity: 4.7, trust: 4.6, relevance: 4.5 },
        selectedRevisionId: selected.id,
      },
    }),
    db.campaignRevision.update({ where: { id: selected.id }, data: { status: RevisionStatus.READY_FOR_APPROVAL } }),
    db.demoRun.update({ where: { id: demoRunId }, data: { status: DemoRunStatus.AWAITING_CAMPAIGN_APPROVAL } }),
  ])
  await appendRunEvent(demoRunId, { type: 'study.completed', status: 'READY_FOR_APPROVAL', summary: 'Terac rehearsal selected Candidate B with a +2.50 rubric delta.', actor: 'fake-terac', proofRef: `terac_fake_${demoRunId}` })
  await decideCampaign(demoRunId, 'APPROVE')

  await db.company.updateMany({
    where: { demoRunId, researchOnly: true },
    data: { monidProviderId: `monid_fake_${demoRunId}` },
  })
  await appendRunEvent(demoRunId, { type: 'research.completed', status: 'COMPLETE', summary: 'Monid rehearsal returned research-only company candidates; no discovered contact was messaged.', actor: 'fake-monid', proofRef: `monid_fake_${demoRunId}` })

  const nordlicht = await db.opportunity.findFirstOrThrow({ where: { demoRunId, company: { name: 'Nordlicht Import GmbH' } } })
  await transitionOpportunity({ opportunityId: nordlicht.id, to: 'OUTREACH', eventType: 'outreach.ready', summary: 'Campaign message prepared for the consenting Nordlicht role-player.', actor: 'gpt-5.6-luna' })
  await db.message.create({ data: { demoRunId, opportunityId: nordlicht.id, externalId: `linq_out_fake_${demoRunId}`, direction: 'OUTBOUND', status: 'DELIVERED', sanitizedBody: 'Pilot outreach delivered to consenting role-player.', rolePlayer: true } })
  await transitionOpportunity({ opportunityId: nordlicht.id, to: 'ENGAGED', eventType: 'reply.received', summary: 'Consenting Nordlicht role-player replied with buying requirements.', actor: 'fake-linq', proofRef: `linq_in_fake_${demoRunId}` })
  await db.message.create({ data: { demoRunId, opportunityId: nordlicht.id, externalId: `linq_in_fake_${demoRunId}`, direction: 'INBOUND', status: 'RECEIVED', sanitizedBody: 'Role-player requested two containers and German law.', rolePlayer: true } })
  await db.agentHandoff.create({
    data: {
      demoRunId,
      roomId: `band_fake_${demoRunId}`,
      live: false,
      status: 'COMPLETE',
      verdict: {
        recommendation: 'ACCEPT',
        proposedPrice: 172,
        risks: ['German law review'],
        rationale: 'Within policy after specialist review',
        agentVotes: [
          { agentId: 'fake-researcher', vote: 'ACCEPT', rationale: 'Evidence supports the terms.' },
          { agentId: 'fake-negotiator', vote: 'ACCEPT', rationale: 'The proposal matches the brief.' },
          { agentId: 'fake-policy-reviewer', vote: 'ACCEPT', rationale: 'EUR 172 is above the EUR 158 floor.' },
        ],
      },
    },
  })
  await transitionOpportunity({ opportunityId: nordlicht.id, to: 'NEGOTIATING', eventType: 'band.verdict', summary: 'Three Band agents returned a schema-valid ACCEPT verdict.', actor: 'fake-band', proofRef: `band_fake_${demoRunId}` })
  await db.message.create({ data: { demoRunId, opportunityId: nordlicht.id, externalId: `linq_proposal_fake_${demoRunId}`, direction: 'OUTBOUND', status: 'DELIVERED', sanitizedBody: 'In-policy proposal delivered to the consenting role-player.', rolePlayer: true } })
  await appendRunEvent(demoRunId, { opportunityId: nordlicht.id, type: 'proposal.sent', status: 'NEGOTIATING', summary: 'The in-policy proposal was delivered through the fake Linq rehearsal.', actor: 'fake-linq', proofRef: `linq_proposal_fake_${demoRunId}` })
  await db.message.create({ data: { demoRunId, opportunityId: nordlicht.id, externalId: `linq_accept_fake_${demoRunId}`, direction: 'INBOUND', status: 'RECEIVED', sanitizedBody: 'The consenting role-player explicitly accepted the proposal.', rolePlayer: true } })
  await transitionOpportunity({ opportunityId: nordlicht.id, to: 'AGREEMENT', eventType: 'agreement.accepted', summary: 'The consenting role-player explicitly accepted in a later Linq message.', actor: 'fake-linq', proofRef: `linq_accept_fake_${demoRunId}` })
  await transitionOpportunity({ opportunityId: nordlicht.id, to: 'SIGNING', eventType: 'document.created', summary: 'Sequential Documenso envelope prepared: owner first, buyer second.', actor: 'fake-documenso', proofRef: `doc_fake_${demoRunId}` })
  await db.demoRun.update({ where: { id: demoRunId }, data: { status: DemoRunStatus.AWAITING_OWNER_SIGNATURE } })
  await recordOwnerSignature(demoRunId)
  await db.document.create({ data: { demoRunId, opportunityId: nordlicht.id, externalId: `doc_fake_${demoRunId}`, live: false, status: 'COMPLETED', ...fakeDocumentEvidenceTimestamps() } })
  await transitionOpportunity({ opportunityId: nordlicht.id, to: 'SIGNED', eventType: 'document.completed', summary: 'Owner and buyer role-player signatures completed in order.', actor: 'fake-documenso', proofRef: `doc_fake_${demoRunId}` })

  await applyMaasPolicyBranch(demoRunId)
  await db.workflowRun.create({ data: { demoRunId, externalId: `render_fake_${demoRunId}`, taskSlug: 'process-linq-reply', live: false, status: 'SUCCEEDED', attempt: 2, retried: true } })
  await db.providerAction.create({ data: { demoRunId, provider: Provider.OPENAI, kind: 'structured-outreach', idempotencyKey: `fake-openai:${demoRunId}`, status: ProviderActionStatus.SUCCEEDED, attempts: 1, request: {}, providerExternalId: `resp_fake_${demoRunId}`, redactedResponse: { model: 'gpt-5.6-luna' } } })
  await db.demoRun.update({ where: { id: demoRunId }, data: { status: DemoRunStatus.COMPLETE, completedAt: new Date() } })
  await appendRunEvent(demoRunId, { type: 'demo.completed', status: 'COMPLETE', summary: 'Rehearsal completed with two owner actions and a visible policy block.', actor: 'system' })
  return demoRunId
}
