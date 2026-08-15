import { DemoRunStatus, RunMode } from '@prisma/client'
import { db } from '../db.js'
import { negotiationVerdictSchema } from '../providers/band/index.js'
import { collectProof } from './demo-service.js'

export type VerificationReport = {
  runId: string
  passed: boolean
  checks: Array<{ name: string; passed: boolean; detail: string }>
}

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null
}

export async function verifyDemoRun(runId: string): Promise<VerificationReport> {
  const run = await db.demoRun.findUniqueOrThrow({
    where: { id: runId },
    include: {
      approvals: true,
      payments: true,
      humanStudies: true,
      agentHandoffs: true,
      workflowRuns: true,
      documents: true,
      messages: true,
      companies: true,
      opportunities: { include: { company: true } },
      providerActions: true,
      providerEvents: true,
      events: true,
    },
  })
  const proof = await collectProof(runId)
  const checks: VerificationReport['checks'] = []
  const check = (name: string, passed: boolean, detail: string) => checks.push({ name, passed, detail })

  check('judge mode', run.mode === RunMode.JUDGE, `mode=${run.mode}`)
  check('run complete', run.status === DemoRunStatus.COMPLETE, `status=${run.status}`)
  const payment = run.payments.find((item) => item.providerMode === 'TEST'
    && !item.livemode
    && item.amount === 500
    && item.currency.toLowerCase() === 'usd'
    && item.status === 'COMPLETED')
  check('real $5 Stripe sandbox activation', Boolean(payment?.stripeEventId && payment.checkoutSessionId), payment ? `signed ${payment.providerMode.toLowerCase()} completion stored` : 'missing qualifying signed Stripe payment')
  const study = run.humanStudies.find((item) => item.provider === 'TERAC' && item.live && item.status === 'COMPLETE')
  check('real Terac comparison', Boolean(study?.externalId && study.respondentCount && study.respondentCount > 0), study ? `delta=${study.scoreDelta}, respondents=${study.respondentCount ?? 0}` : 'missing real completed study')
  const nordlicht = run.opportunities.find((item) => item.company.name === 'Nordlicht Import GmbH')
  const maas = run.opportunities.find((item) => item.company.name === 'Maas Interiors BV')
  const liveInbound = (opportunityId: string | undefined) => run.messages.filter((item) => item.opportunityId === opportunityId
    && item.direction === 'INBOUND'
    && item.rolePlayer
    && item.live
    && Boolean(item.externalId))
  const processedLinqReceipt = (proofRef: string | null) => Boolean(proofRef && run.providerEvents.some((item) => item.provider === 'LINQ'
    && item.eventType === 'message.received'
    && item.externalEventId === proofRef
    && item.processedAt))
  const nordlichtReply = run.events.find((item) => item.opportunityId === nordlicht?.id && item.type === 'reply.received')
  const nordlichtAcceptance = run.events.find((item) => item.opportunityId === nordlicht?.id && item.type === 'agreement.accepted')
  const maasBlock = run.events.find((item) => item.opportunityId === maas?.id && item.type === 'policy.blocked')
  check(
    'real Linq role-player webhooks',
    liveInbound(nordlicht?.id).length >= 2
      && liveInbound(maas?.id).length >= 1
      && processedLinqReceipt(nordlichtReply?.proofRef ?? null)
      && processedLinqReceipt(nordlichtAcceptance?.proofRef ?? null)
      && processedLinqReceipt(maasBlock?.proofRef ?? null),
    'requires processed signed inbound events for Nordlicht engagement, later acceptance, and Maas policy input',
  )
  const bandAction = run.providerActions.find((item) => item.provider === 'BAND'
    && item.kind === 'external-agents.negotiation'
    && item.live
    && item.status === 'SUCCEEDED'
    && Boolean(item.providerExternalId))
  const storedBandResult = record(bandAction?.redactedResponse)
  const bandSummary = record(storedBandResult?.summary)
  const bandData = record(storedBandResult?.data)
  const externalAgentIds = record(bandData?.externalAgentIds)
  const summaryAgentIds = record(bandSummary?.externalAgentIds)
  const requiredAgentRoles = ['negotiator', 'researcher', 'policyReviewer'] as const
  const requiredExternalAgents = ['negotiator', 'researcher', 'policyReviewer']
    .map((role) => externalAgentIds?.[role])
    .filter((value): value is string => typeof value === 'string' && value.length > 0)
  const uniqueExternalAgents = new Set(requiredExternalAgents)
  const exactExternalAgentShape = Boolean(externalAgentIds)
    && Object.keys(externalAgentIds!).length === requiredAgentRoles.length
    && requiredAgentRoles.every((role) => typeof externalAgentIds?.[role] === 'string')
  const sameExternalAgents = JSON.stringify(summaryAgentIds) === JSON.stringify(externalAgentIds)
  const dataRoomId = typeof bandData?.roomId === 'string' ? bandData.roomId : null
  const coherentStoredProof = Boolean(bandSummary && bandData && dataRoomId)
    && bandSummary?.roomId === dataRoomId
    && bandSummary?.briefMessageId === bandData?.briefMessageId
    && bandSummary?.runtime === bandData?.runtime
    && bandSummary?.model === bandData?.model
    && sameExternalAgents
  const codexSolProven = String(bandData?.runtime).toUpperCase() === 'CODEX' && bandData?.model === 'gpt-5.6-sol'
  const storedVerdict = negotiationVerdictSchema.safeParse(bandData?.verdict)
  const bandHandoff = run.agentHandoffs.find((item) => item.live
    && item.status === 'COMPLETE'
    && item.roomId === dataRoomId
    && negotiationVerdictSchema.safeParse(item.verdict).success)
  const handoffVerdict = negotiationVerdictSchema.safeParse(bandHandoff?.verdict)
  const floorSafeProceed = handoffVerdict.success
    && ['ACCEPT', 'COUNTER'].includes(handoffVerdict.data.recommendation)
    && handoffVerdict.data.proposedPrice !== null
    && handoffVerdict.data.proposedPrice >= 158
  const sameVerdict = storedVerdict.success
    && handoffVerdict.success
    && JSON.stringify(storedVerdict.data) === JSON.stringify(handoffVerdict.data)
  check(
    'real Band external-agent verdict',
    Boolean(bandHandoff)
      && coherentStoredProof
      && bandAction?.providerExternalId === `band:${dataRoomId}`
      && exactExternalAgentShape
      && requiredExternalAgents.length === 3
      && uniqueExternalAgents.size === 3
      && codexSolProven
      && floorSafeProceed
      && sameVerdict,
    bandAction
      ? `external agents=${uniqueExternalAgents.size}, runtime=${String(bandData?.runtime ?? 'unproven')}, model=${String(bandData?.model ?? 'unproven')}`
      : 'requires live room, three external identities, policy verdict, and transcript-authored Codex/Sol proof',
  )
  check('Render retry proof', run.workflowRuns.some((item) => item.live && ['SUCCEEDED', 'COMPLETED'].includes(item.status) && item.retried && item.attempt >= 2), 'requires successful live retry')
  check('Documenso completed', run.documents.some((item) => item.live && item.status === 'COMPLETED' && item.ownerSignedAt && item.buyerSignedAt), 'requires both sequential signatures')
  check('runtime Monid discovery', run.companies.some((item) => Boolean(item.monidProviderId) && item.monidLive && item.researchOnly), 'requires a live research-only provider id')
  check('GPT-5.6 Luna response', run.providerActions.some((item) => item.provider === 'OPENAI' && item.live && item.status === 'SUCCEEDED' && Boolean(item.providerExternalId)), 'requires real structured response id')
  check('second Terac contract review', run.providerActions.some((item) => item.provider === 'TERAC' && item.kind === 'german-law-contract-review' && item.live && item.status === 'SUCCEEDED' && Boolean(item.providerExternalId)), 'requires real completed German-law review task')
  const ownerKinds = new Set(run.approvals.filter((item) => item.decision === 'APPROVE').map((item) => item.kind))
  check('exactly two recorded owner approvals', run.approvals.length === 2 && ownerKinds.has('CAMPAIGN') && ownerKinds.has('OWNER_SIGNATURE'), `approvals=${run.approvals.length}`)
  check(
    'signed Nordlicht deal',
    nordlicht?.stage === 'SIGNED'
      && Boolean(nordlichtReply)
      && Boolean(nordlichtAcceptance)
      && new Set([nordlichtReply?.proofRef, nordlichtAcceptance?.proofRef]).size === 2,
    'canonical branch requires a reply and a distinct later explicit-acceptance event',
  )
  const outboundAfterMaasBlock = maasBlock
    ? run.messages.some((item) => item.opportunityId === maas?.id
      && item.direction === 'OUTBOUND'
      && item.occurredAt > maasBlock.occurredAt)
    : false
  check(
    'Maas policy block',
    maas?.stage === 'PAUSED'
      && maas.stageReason === 'POLICY_BELOW_FLOOR'
      && Boolean(maasBlock)
      && !outboundAfterMaasBlock,
    'below-floor signed inbound must pause with no subsequent reply',
  )
  const providers = new Set(proof.filter((item) => item.live).map((item) => item.provider))
  check('single-run sponsor proof', ['STRIPE', 'TERAC', 'LINQ', 'BAND', 'RENDER', 'DOCUMENSO', 'MONID', 'OPENAI'].every((provider) => providers.has(provider as never)), `live providers=${[...providers].join(',')}`)
  return { runId, passed: checks.every((item) => item.passed), checks }
}
