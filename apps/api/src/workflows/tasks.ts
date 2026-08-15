import { createHash } from 'node:crypto'
import { DemoRunStatus, Prisma, Provider, RevisionStatus } from '@prisma/client'
import { db } from '../db.js'
import { getConfig } from '../config.js'
import { appendRunEvent, transitionOpportunity } from '../domain/demo-service.js'
import { evaluatePricePolicy } from '../domain/policy.js'
import { dispatchProviderAction, type ProviderRegistry } from '../outbox.js'
import { TeracContractReviewProvider } from '../providers/terac/contract-review.js'
import type { TeracStudyData } from '../providers/terac/index.js'
import type { MonidDiscoveryResult } from '../providers/monid/index.js'
import type { SalesDraftRequest } from '../providers/openai.js'
import type { LinqSendRequest, LinqSendResult } from '../providers/linq/index.js'
import { bandNegotiationResultSchema, type BandNegotiationRequest, type NegotiationVerdict } from '../providers/band/index.js'
import type { DocumensoEnvelopeData, DocumensoEnvelopeRequest } from '../providers/documenso/index.js'
import type { ProviderResult } from '../providers/types.js'

export const workflowTaskSlugs = [
  'run-terac-campaign-study',
  'discover-research-leads',
  'send-nordlicht-outreach',
  'run-band-negotiation',
  'review-contract-and-create-envelope',
  'prove-render-retry',
] as const

export type WorkflowTaskSlug = (typeof workflowTaskSlugs)[number]

async function plannedAction(
  registry: ProviderRegistry,
  demoRunId: string,
  provider: Provider,
  kind: string,
  idempotencyKey: string,
  request: Prisma.InputJsonValue,
): Promise<ProviderResult> {
  const action = await db.providerAction.upsert({
    where: { idempotencyKey },
    create: { demoRunId, provider, kind, idempotencyKey, request },
    update: {},
  })
  return dispatchProviderAction(action.id, registry)
}

type LinqEligibleCompany = {
  name: string
  researchOnly: boolean
  monidProviderId: string | null
}

type LinqEligibleContact = {
  consented: boolean
  rolePlayer: boolean
  addressHash: string | null
} | null

export function recipientFingerprint(address: string): string {
  return createHash('sha256').update(address).digest('hex').slice(0, 16)
}

export function assertLinqRecipientEligible(
  company: LinqEligibleCompany,
  contact: LinqEligibleContact,
  configuredAddress: string | undefined,
): asserts configuredAddress is string {
  if (company.researchOnly || company.monidProviderId !== null) {
    throw new Error(`${company.name} is research-only or Monid-discovered and cannot receive Linq messages`)
  }
  if (!contact?.consented || !contact.rolePlayer || !configuredAddress) {
    throw new Error(`${company.name} does not have an explicitly consented role-player recipient`)
  }
  if (!contact.addressHash || recipientFingerprint(configuredAddress) !== contact.addressHash) {
    throw new Error(`${company.name} configured recipient does not match the stored consent fingerprint`)
  }
}

export type BandPolicyDecision =
  | { outcome: 'APPROVE'; proposedPrice: number; rationale: string }
  | { outcome: 'PAUSE'; reason: string; summary: string }

export function evaluateBandVerdict(verdict: NegotiationVerdict): BandPolicyDecision {
  if (verdict.recommendation === 'REJECT' || verdict.recommendation === 'ESCALATE') {
    return {
      outcome: 'PAUSE',
      reason: `BAND_${verdict.recommendation}`,
      summary: verdict.rationale,
    }
  }
  if (verdict.proposedPrice === null || !Number.isFinite(verdict.proposedPrice)) {
    throw new Error('Band returned a malformed verdict without a finite proposed price')
  }
  const policy = evaluatePricePolicy({
    offeredPrice: verdict.proposedPrice,
    floorPrice: 158,
    currency: 'EUR',
    unit: 'seat',
  })
  if (policy.outcome === 'PAUSE') {
    return { outcome: 'PAUSE', reason: policy.reason, summary: policy.summary }
  }
  return { outcome: 'APPROVE', proposedPrice: verdict.proposedPrice, rationale: policy.reason }
}

export function bandRequestFromInbound(sanitizedBody: string): BandNegotiationRequest {
  const brief = sanitizedBody.trim()
  if (!brief) throw new Error('Verified Linq inbound message has no usable sanitized body')
  return {
    brief,
    currency: 'EUR',
    localPolicy: 'Seller target EUR 172 per seat; hard floor EUR 158 per seat. Do not make binding legal claims. Local policy is authoritative.',
  }
}

export function resolveMonidCompanyMatch<T extends { monidProviderId: string | null; researchOnly: boolean }>(
  providerMatch: T | null,
  nameMatch: T | null,
  externalCompanyId: string,
): { action: 'USE'; company: T } | { action: 'CREATE' } | { action: 'SKIP_COLLISION' } {
  if (providerMatch) {
    return providerMatch.researchOnly
      ? { action: 'USE', company: providerMatch }
      : { action: 'SKIP_COLLISION' }
  }
  if (!nameMatch) return { action: 'CREATE' }
  if (nameMatch.researchOnly && nameMatch.monidProviderId === externalCompanyId) {
    return { action: 'USE', company: nameMatch }
  }
  return { action: 'SKIP_COLLISION' }
}

async function appendRunEventOnce(
  demoRunId: string,
  event: Parameters<typeof appendRunEvent>[1],
): Promise<void> {
  const existing = await db.event.findFirst({
    where: {
      demoRunId,
      opportunityId: event.opportunityId ?? null,
      type: event.type,
      proofRef: event.proofRef ?? null,
    },
  })
  if (existing) return
  try {
    await appendRunEvent(demoRunId, event)
  } catch (error) {
    if (event.proofRef && error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') return
    throw error
  }
}

function meanScore(scores: { clarity: number; trust: number; relevance: number }): number {
  return (scores.clarity + scores.trust + scores.relevance) / 3
}

export async function runTeracCampaignStudy(demoRunId: string, registry: ProviderRegistry): Promise<void> {
  const run = await db.demoRun.findUniqueOrThrow({ where: { id: demoRunId }, include: { campaign: { include: { revisions: true } } } })
  const baseline = run.campaign.revisions.find((item) => item.label === 'Baseline')
  const candidates = run.campaign.revisions.filter((item) => item.label.startsWith('Candidate')).sort((a, b) => a.label.localeCompare(b.label))
  if (!baseline || candidates.length !== 2) throw new Error('Campaign requires one baseline and exactly two candidates')
  const result = await plannedAction(registry, demoRunId, Provider.TERAC, 'campaign-comparative-study', `terac-study:${demoRunId}`, {
    baseline: { id: baseline.id, content: JSON.stringify(baseline.body) },
    candidates: candidates.map((item) => ({ id: item.id, content: JSON.stringify(item.body) })),
    audience: 'Northern European furniture import buyers',
    question: 'Rate each campaign on clarity, trust, and relevance using the same rubric.',
  })
  const data = result.data as unknown as TeracStudyData
  if (data.status !== 'COMPLETE') throw new Error('Terac study did not complete')
  if (!data.baselineScores && run.mode === 'JUDGE') throw new Error('Judged Terac result must include baseline scores')
  if (run.mode === 'JUDGE' && (!data.respondentCount || data.respondentCount < 1)) {
    throw new Error('Judged Terac result must include at least one human respondent')
  }
  const winner = candidates.find((item) => item.id === data.winnerId)
  const winnerScores = data.scores.find((item) => item.candidateId === data.winnerId)
  if (!winner || !winnerScores) throw new Error('Terac winner did not match a candidate revision')
  const baselineScore = data.baselineScores ? meanScore(data.baselineScores) : 40
  const selectedScore = meanScore(winnerScores)
  await db.$transaction([
    db.humanStudy.upsert({ where: { provider_externalId: { provider: Provider.TERAC, externalId: result.externalId } }, create: { demoRunId, externalId: result.externalId, live: result.live, status: 'COMPLETE', baselineScore, selectedScore, scoreDelta: selectedScore - baselineScore, respondentCount: data.respondentCount ?? null, rubric: { baseline: data.baselineScores ?? null, selected: winnerScores }, selectedRevisionId: winner.id }, update: {} }),
    db.campaignRevision.update({ where: { id: winner.id }, data: { status: RevisionStatus.READY_FOR_APPROVAL } }),
    db.demoRun.update({ where: { id: demoRunId }, data: { status: DemoRunStatus.AWAITING_CAMPAIGN_APPROVAL } }),
  ])
  await appendRunEventOnce(demoRunId, { type: 'study.completed', status: 'READY_FOR_APPROVAL', summary: `Terac selected ${winner.label} with a ${(selectedScore - baselineScore).toFixed(2)}-point average lift.`, actor: 'terac', proofRef: result.externalId })
}

export async function discoverResearchLeads(demoRunId: string, registry: ProviderRegistry): Promise<void> {
  const result = await plannedAction(registry, demoRunId, Provider.MONID, 'runtime-research-discovery', `monid-discovery:${demoRunId}`, {
    query: 'European furniture importers buying upholstered sofas or dining furniture from China',
    maxResults: 8,
    filters: { region: 'Europe', buyerType: 'importer' },
  })
  const data = result.data as unknown as MonidDiscoveryResult
  const run = await db.demoRun.findUniqueOrThrow({ where: { id: demoRunId } })
  for (const company of data.companies) {
    const providerMatch = await db.company.findFirst({ where: { demoRunId, monidProviderId: company.externalCompanyId } })
    const nameMatch = await db.company.findUnique({ where: { demoRunId_name: { demoRunId, name: company.name } } })
    const match = resolveMonidCompanyMatch(providerMatch, nameMatch, company.externalCompanyId)
    if (match.action === 'SKIP_COLLISION') continue
    const created = match.action === 'USE' ? match.company : await db.company.create({
        data: { demoRunId, name: company.name, website: company.website, country: company.country ?? 'Unknown', focus: company.description ?? 'Furniture importing', monidProviderId: company.externalCompanyId, monidLive: result.live, researchOnly: true },
      })
    await db.opportunity.upsert({
      where: { demoRunId_companyId: { demoRunId, companyId: created.id } },
      create: { demoRunId, campaignId: run.campaignId, companyId: created.id },
      update: {},
    })
  }
  await appendRunEventOnce(demoRunId, { type: 'research.completed', status: 'COMPLETE', summary: `Monid discovered ${data.companies.length} research-only companies. None were messaged.`, actor: 'monid', proofRef: result.externalId })
}

export async function sendNordlichtOutreach(demoRunId: string, registry: ProviderRegistry): Promise<void> {
  const config = getConfig()
  if (!config.REAL_ACTIONS_ENABLED && config.PROVIDER_MODE === 'real') throw new Error('Real actions are disabled')
  const opportunity = await db.opportunity.findFirstOrThrow({ where: { demoRunId, company: { name: 'Nordlicht Import GmbH' } }, include: { company: true, contact: true } })
  assertLinqRecipientEligible(opportunity.company, opportunity.contact, config.LINQ_NORDLICHT_RECIPIENT)
  if (!opportunity.contact) throw new Error('Nordlicht role-player contact is missing')
  if (opportunity.stage === 'RESEARCHING') {
    await transitionOpportunity({ opportunityId: opportunity.id, to: 'OUTREACH', eventType: 'outreach.prepared', summary: 'Structured outreach prepared for the consenting Nordlicht role-player.', actor: 'gpt-5.6-luna' })
  }
  const draftResult = await plannedAction(registry, demoRunId, Provider.OPENAI, 'structured-outreach', `openai-outreach:${demoRunId}:${opportunity.id}`, {
    company: opportunity.company.name,
    rolePlayerName: opportunity.contact.name,
    product: opportunity.company.focus,
    evidence: ['FSC Mix documentation available', 'EU sofa target price EUR 172 per seat', 'Approved floor EUR 158 per seat'],
    objective: 'Invite the role-player to discuss a two-container pilot without making unsupported claims',
  } satisfies SalesDraftRequest)
  const draft = draftResult.data as unknown as { subject: string; body: string; needsHumanReview: boolean }
  if (draft.needsHumanReview) throw new Error('OpenAI draft requested review; autonomous send stopped')
  assertLinqRecipientEligible(opportunity.company, opportunity.contact, config.LINQ_NORDLICHT_RECIPIENT)
  const linqResult = await plannedAction(registry, demoRunId, Provider.LINQ, 'message.send', `linq-outreach:${demoRunId}:${opportunity.id}`, {
    recipient: { address: config.LINQ_NORDLICHT_RECIPIENT, consented: true, rolePlayerId: 'nordlicht' },
    text: `${draft.subject}\n\n${draft.body}`,
  } satisfies LinqSendRequest)
  const linq = linqResult.data as unknown as LinqSendResult
  await db.message.upsert({ where: { provider_externalId: { provider: Provider.LINQ, externalId: linqResult.externalId } }, create: { demoRunId, opportunityId: opportunity.id, externalId: linqResult.externalId, threadExternalId: linq.chatId, direction: 'OUTBOUND', status: linqResult.status, sanitizedBody: 'Campaign outreach delivered to consenting Nordlicht role-player.', rolePlayer: true, live: linqResult.live }, update: {} })
  await appendRunEventOnce(demoRunId, { opportunityId: opportunity.id, type: 'message.sent', status: 'OUTREACH', summary: 'Linq delivered the campaign to the consenting Nordlicht role-player.', actor: 'linq', proofRef: linqResult.externalId })

  const maas = await db.opportunity.findFirstOrThrow({ where: { demoRunId, company: { name: 'Maas Interiors BV' } }, include: { company: true, contact: true } })
  if (maas.stage === 'RESEARCHING') {
    await transitionOpportunity({ opportunityId: maas.id, to: 'OUTREACH', eventType: 'policy-scenario.started', summary: 'A separate consenting Maas role-player entered the price-policy scenario.', actor: 'system' })
  }
  assertLinqRecipientEligible(maas.company, maas.contact, config.LINQ_MAAS_RECIPIENT)
  const maasResult = await plannedAction(registry, demoRunId, Provider.LINQ, 'message.send', `linq-maas:${demoRunId}:${maas.id}`, {
    recipient: { address: config.LINQ_MAAS_RECIPIENT, consented: true, rolePlayerId: 'maas' },
    text: 'Hengxin Home demo: please reply with your requested per-seat price for the dining pilot. This message is part of the consented hackathon policy test.',
  } satisfies LinqSendRequest)
  const maasLinq = maasResult.data as unknown as LinqSendResult
  await db.message.upsert({ where: { provider_externalId: { provider: Provider.LINQ, externalId: maasResult.externalId } }, create: { demoRunId, opportunityId: maas.id, externalId: maasResult.externalId, threadExternalId: maasLinq.chatId, direction: 'OUTBOUND', status: maasResult.status, sanitizedBody: 'Policy-test prompt delivered to consenting Maas role-player.', rolePlayer: true, live: maasResult.live }, update: {} })
  await appendRunEventOnce(demoRunId, { opportunityId: maas.id, type: 'message.sent', status: 'OUTREACH', summary: 'Linq delivered the policy-test prompt to the consenting Maas role-player.', actor: 'linq', proofRef: maasResult.externalId })
}

export async function runBandNegotiation(demoRunId: string, registry: ProviderRegistry): Promise<void> {
  const config = getConfig()
  const opportunity = await db.opportunity.findFirstOrThrow({ where: { demoRunId, company: { name: 'Nordlicht Import GmbH' } }, include: { company: true, contact: true } })
  if (!['ENGAGED', 'NEGOTIATING', 'PAUSED'].includes(opportunity.stage)) throw new Error('Band negotiation requires an engaged opportunity')
  const inbound = await db.message.findFirst({
    where: {
      demoRunId,
      opportunityId: opportunity.id,
      provider: Provider.LINQ,
      direction: 'INBOUND',
      live: true,
      threadExternalId: { not: null },
    },
    orderBy: { occurredAt: 'desc' },
  })
  if (!inbound) throw new Error('Band negotiation requires a verified live Linq inbound on the opportunity thread')
  const bandRequest = bandRequestFromInbound(inbound.sanitizedBody)
  const result = await plannedAction(registry, demoRunId, Provider.BAND, 'external-agents.negotiation', `band-negotiation:${demoRunId}:${opportunity.id}`, bandRequest)
  const parsed = bandNegotiationResultSchema.safeParse(result.data)
  if (!parsed.success) throw new Error(`Band returned malformed negotiation data: ${parsed.error.message}`)
  const data = parsed.data
  await db.agentHandoff.upsert({ where: { provider_roomId: { provider: Provider.BAND, roomId: data.roomId } }, create: { demoRunId, roomId: data.roomId, live: result.live, status: result.status, verdict: data.verdict }, update: {} })
  const decision = evaluateBandVerdict(data.verdict)
  if (decision.outcome === 'PAUSE') {
    if (opportunity.stage !== 'PAUSED') {
      await transitionOpportunity({ opportunityId: opportunity.id, to: 'PAUSED', reason: decision.reason, eventType: 'band.paused', summary: decision.summary, actor: 'band', proofRef: result.externalId })
    }
    return
  }
  if (opportunity.stage === 'PAUSED') return
  assertLinqRecipientEligible(opportunity.company, opportunity.contact, config.LINQ_NORDLICHT_RECIPIENT)
  // Move to NEGOTIATING before the external send. A very fast buyer reply can
  // arrive while the Linq request is returning; the webhook must already see
  // the acceptance-eligible stage instead of permanently consuming it as an
  // ENGAGED reply.
  if (opportunity.stage === 'ENGAGED') {
    await transitionOpportunity({ opportunityId: opportunity.id, to: 'NEGOTIATING', eventType: 'band.verdict', summary: `Band external agents recommended ${data.verdict.recommendation}; local policy approved the price floor before sending.`, actor: 'band', proofRef: result.externalId })
  }
  const proposalResult = await plannedAction(registry, demoRunId, Provider.LINQ, 'message.send', `linq-negotiation-proposal:${demoRunId}:${opportunity.id}:${decision.proposedPrice}`, {
    recipient: { address: config.LINQ_NORDLICHT_RECIPIENT, consented: true, rolePlayerId: 'nordlicht' },
    text: `Proposed commercial terms: EUR ${decision.proposedPrice} per seat for the two-container pilot. This proposal remains subject to buyer acceptance and contract review.`,
  } satisfies LinqSendRequest)
  const proposal = proposalResult.data as unknown as LinqSendResult
  await db.message.upsert({ where: { provider_externalId: { provider: Provider.LINQ, externalId: proposalResult.externalId } }, create: { demoRunId, opportunityId: opportunity.id, externalId: proposalResult.externalId, threadExternalId: proposal.chatId, direction: 'OUTBOUND', status: proposalResult.status, sanitizedBody: `In-policy proposal sent at EUR ${decision.proposedPrice} per seat; awaiting buyer acceptance.`, rolePlayer: true, live: proposalResult.live }, update: {} })
  await appendRunEventOnce(demoRunId, { opportunityId: opportunity.id, type: 'proposal.sent', status: 'NEGOTIATING', summary: `Linq sent the locally approved EUR ${decision.proposedPrice} per-seat proposal; buyer acceptance is still required.`, actor: 'linq', proofRef: proposalResult.externalId })
}

export async function reviewContractAndCreateEnvelope(demoRunId: string, registry: ProviderRegistry): Promise<void> {
  const config = getConfig()
  if (!config.DOCUMENSO_BUYER_EMAIL) throw new Error('DOCUMENSO_BUYER_EMAIL is required for the consenting buyer role-player')
  const opportunity = await db.opportunity.findFirstOrThrow({ where: { demoRunId, company: { name: 'Nordlicht Import GmbH' } } })
  if (!['AGREEMENT', 'SIGNING'].includes(opportunity.stage)) throw new Error('Contract creation requires an agreement')
  const reviewProvider = new TeracContractReviewProvider({ baseUrl: config.TERAC_API_BASE_URL, apiKey: config.TERAC_API_KEY, path: config.TERAC_CONTRACT_REVIEW_PATH })
  registry.set('TERAC_CONTRACT_REVIEW', reviewProvider)
  const reviewAction = await db.providerAction.upsert({ where: { idempotencyKey: `terac-contract:${demoRunId}` }, create: { demoRunId, provider: Provider.TERAC, kind: 'german-law-contract-review', idempotencyKey: `terac-contract:${demoRunId}`, request: { jurisdiction: 'Germany', contractText: 'Hengxin Home and Nordlicht two-container pilot under German law.', question: 'Review governing law, inspection, delivery, limitation, and dispute clauses.' } }, update: {} })
  await dispatchProviderAction(reviewAction.id, new Map([['TERAC', reviewProvider]]))
  const envelope = await plannedAction(registry, demoRunId, Provider.DOCUMENSO, 'sequential-envelope', `documenso:${demoRunId}:${opportunity.id}`, {
    owner: { name: 'Hengxin Home Owner', email: config.OWNER_EMAIL },
    buyer: { name: 'Nordlicht Role-player', email: config.DOCUMENSO_BUYER_EMAIL, consentedAt: new Date().toISOString() },
  } satisfies DocumensoEnvelopeRequest)
  const data = envelope.data as unknown as DocumensoEnvelopeData
  await db.document.upsert({ where: { provider_externalId: { provider: Provider.DOCUMENSO, externalId: data.envelopeId } }, create: { demoRunId, opportunityId: opportunity.id, externalId: data.envelopeId, live: envelope.live, status: data.status }, update: {} })
  if (opportunity.stage === 'AGREEMENT') {
    await transitionOpportunity({ opportunityId: opportunity.id, to: 'SIGNING', eventType: 'document.created', summary: 'Terac reviewed German-law clauses; Documenso started owner-first sequential signing.', actor: 'documenso', proofRef: envelope.externalId })
  }
  await db.demoRun.update({ where: { id: demoRunId }, data: { status: DemoRunStatus.AWAITING_OWNER_SIGNATURE } })
}

export async function executeWorkflowTask(slug: WorkflowTaskSlug, demoRunId: string, registry: ProviderRegistry): Promise<void> {
  if (slug === 'run-terac-campaign-study') return runTeracCampaignStudy(demoRunId, registry)
  if (slug === 'discover-research-leads') return discoverResearchLeads(demoRunId, registry)
  if (slug === 'send-nordlicht-outreach') return sendNordlichtOutreach(demoRunId, registry)
  if (slug === 'run-band-negotiation') return runBandNegotiation(demoRunId, registry)
  if (slug === 'review-contract-and-create-envelope') return reviewContractAndCreateEnvelope(demoRunId, registry)
  if (slug === 'prove-render-retry') return
  const exhaustive: never = slug
  throw new Error(`Unknown workflow task ${exhaustive}`)
}
