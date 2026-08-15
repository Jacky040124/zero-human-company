import { ThenvoiLink } from '@band-ai/sdk'
import type { AgentIdentity, PlatformChatMessage } from '@band-ai/sdk/rest'
import { createHash } from 'node:crypto'
import { z } from 'zod'
import { sanitizeSensitiveText } from '../../domain/sanitize.js'
import {
  ProviderOutcomeUnknownError,
  requireConfig,
  sanitizedExternalId,
  type ProviderCapabilities,
  type ProviderPort,
  type ProviderReconcileContext,
  type ProviderRequest,
  type ProviderResult,
} from '../types.js'

export const BAND_VERDICT_PREFIX = 'ZHC_VERDICT'

const BAND_RISK_MAX_LENGTH = 500
const BAND_RATIONALE_MAX_LENGTH = 2_000
const BAND_VOTE_RATIONALE_MAX_LENGTH = 1_000

export const negotiationVerdictSchema = z.object({
  recommendation: z.enum(['ACCEPT', 'COUNTER', 'REJECT', 'ESCALATE']),
  proposedPrice: z.number().nonnegative().nullable(),
  risks: z.array(z.string().min(1).max(BAND_RISK_MAX_LENGTH)).max(20),
  rationale: z.string().min(1).max(BAND_RATIONALE_MAX_LENGTH),
  agentVotes: z.array(z.object({
    agentId: z.string().min(1),
    vote: z.enum(['ACCEPT', 'COUNTER', 'REJECT', 'ESCALATE']),
    rationale: z.string().min(1).max(BAND_VOTE_RATIONALE_MAX_LENGTH),
  })).min(1).max(20),
})

export type NegotiationVerdict = z.infer<typeof negotiationVerdictSchema>

export type BandNegotiationRequest = {
  brief: string
  currency: string
  askingPrice?: number
  localPolicy: string
}

const bandNegotiationRequestSchema = z.object({
  brief: z.string(),
  currency: z.string(),
  askingPrice: z.number().optional(),
  localPolicy: z.string(),
})

export const bandNegotiationResultSchema = z.object({
  roomId: z.string().min(1),
  briefMessageId: z.string().min(1).nullable(),
  verdict: negotiationVerdictSchema,
  externalAgentIds: z.object({
    negotiator: z.string().min(1),
    researcher: z.string().min(1),
    policyReviewer: z.string().min(1),
  }),
  model: z.string().min(1).nullable(),
  runtime: z.string().min(1).nullable(),
  localPolicyAuthoritative: z.literal(true),
})

export type BandNegotiationResult = z.infer<typeof bandNegotiationResultSchema>

export type BandConfig = {
  restUrl?: string
  baseUrl?: string
  apiKey?: string
  negotiatorApiKey?: string
  researcherApiKey?: string
  policyReviewerApiKey?: string
  researcherAgentId?: string
  negotiatorAgentId?: string
  policyReviewerAgentId?: string
  model?: string
  pollIntervalMs?: number
  maxPollDurationMs?: number
}

export type BandMention = {
  id: string
  handle?: string
  name?: string
}

export type BandChat = {
  id: string
  taskId: string | null
}

export interface BandExternalCoordinator {
  getIdentity(agentId: string): Promise<AgentIdentity>
  createChat(): Promise<{ id: string }>
  listParticipants(chatId: string): Promise<Array<{ id: string }>>
  addParticipant(chatId: string, participantId: string, role: 'member'): Promise<void>
  sendMessage(chatId: string, content: string, mentions: BandMention[]): Promise<{ id: string | null }>
  getChatContext(chatId: string): Promise<PlatformChatMessage[]>
  listChats(): Promise<BandChat[]>
}

type BandSleep = (milliseconds: number) => Promise<void>

export function stableBandOperationId(idempotencyKey: string): string {
  return createHash('sha256').update(`zero-human-company:band:${idempotencyKey}`).digest('hex').slice(0, 32)
}

const operationMarker = (operationId: string) => `ZHC_OPERATION_ID:${operationId}`
const briefMarker = (operationId: string) => `ZHC_BRIEF_ID:${operationId}`
const createOutcomeUnknownHint = (operationId: string) => `band:create-outcome-unknown:${operationId}`

function apiKeyFor(config: BandConfig, agentId: string): string {
  if (agentId === config.negotiatorAgentId) return config.negotiatorApiKey ?? config.apiKey ?? ''
  if (agentId === config.researcherAgentId) return config.researcherApiKey ?? config.apiKey ?? ''
  if (agentId === config.policyReviewerAgentId) return config.policyReviewerApiKey ?? config.apiKey ?? ''
  return config.apiKey ?? ''
}

function messageId(value: Record<string, unknown>): string | null {
  for (const key of ['id', 'messageId', 'message_id']) {
    if (typeof value[key] === 'string' && value[key].trim()) return value[key]
  }
  return null
}

function chatRecord(value: Record<string, unknown>): BandChat | null {
  const id = typeof value.id === 'string' ? value.id : null
  const taskId = typeof value.task_id === 'string'
    ? value.task_id
    : typeof value.taskId === 'string'
      ? value.taskId
      : null
  return id ? { id, taskId } : null
}

export class ThenvoiExternalCoordinator implements BandExternalCoordinator {
  private readonly links = new Map<string, ThenvoiLink>()

  constructor(private readonly config: BandConfig) {}

  async getIdentity(agentId: string): Promise<AgentIdentity> {
    const identity = await this.link(agentId).rest.getAgentMe()
    if (!identity.id || identity.id !== agentId) {
      throw new Error(`Band credentials did not resolve the configured external agent ${agentId}`)
    }
    return identity
  }

  async createChat(): Promise<{ id: string }> {
    // Band's optional task_id references an existing Band Task resource. Our
    // workflow idempotency key is instead persisted as a sanitized chat marker.
    return this.negotiator().rest.createChat()
  }

  async listParticipants(chatId: string): Promise<Array<{ id: string }>> {
    return this.negotiator().rest.listChatParticipants(chatId)
  }

  async addParticipant(chatId: string, participantId: string, role: 'member'): Promise<void> {
    await this.negotiator().rest.addChatParticipant(chatId, { participantId, role })
  }

  async sendMessage(
    chatId: string,
    content: string,
    mentions: BandMention[],
  ): Promise<{ id: string | null }> {
    const result = await this.negotiator().rest.createChatMessage(chatId, { content, mentions })
    return { id: messageId(result) }
  }

  async getChatContext(chatId: string): Promise<PlatformChatMessage[]> {
    const rest = this.negotiator().rest
    const getChatContext = rest.getChatContext
    if (!getChatContext) throw new Error('Band SDK REST context hydration is unavailable')
    const messages: PlatformChatMessage[] = []
    const pageSize = 100
    const maxPages = 20
    for (let page = 1; page <= maxPages; page += 1) {
      const response = await getChatContext.call(rest, { chatId, page, pageSize })
      messages.push(...response.data)
      const totalPages = response.metadata?.totalPages
      if (typeof totalPages === 'number' ? page >= totalPages : response.data.length < pageSize) {
        return messages
      }
    }
    throw new Error(`Band chat context exceeded the safe pagination limit of ${maxPages * pageSize} messages`)
  }

  async listChats(): Promise<BandChat[]> {
    const chats = await this.negotiator().listAllChats({ pageSize: 100, maxPages: 20 })
    return chats.map(chatRecord).filter((chat): chat is BandChat => chat !== null)
  }

  private negotiator(): ThenvoiLink {
    return this.link(this.config.negotiatorAgentId as string)
  }

  private link(agentId: string): ThenvoiLink {
    const existing = this.links.get(agentId)
    if (existing) return existing
    const link = new ThenvoiLink({
      agentId,
      apiKey: apiKeyFor(this.config, agentId),
      ...(this.config.restUrl ?? this.config.baseUrl
        ? { restUrl: this.config.restUrl ?? this.config.baseUrl }
        : {}),
    })
    this.links.set(agentId, link)
    return link
  }
}

const defaultSleep: BandSleep = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds))

export function validateNegotiationVerdict(value: unknown): NegotiationVerdict {
  return negotiationVerdictSchema.parse(value)
}

function sanitizedVerdictText(value: string, maxLength: number): string {
  return sanitizeSensitiveText(value, maxLength) || 'Sensitive details redacted.'
}

function sanitizeNegotiationVerdict(verdict: NegotiationVerdict): NegotiationVerdict {
  return {
    ...verdict,
    risks: verdict.risks.map((risk) => sanitizedVerdictText(risk, BAND_RISK_MAX_LENGTH)),
    rationale: sanitizedVerdictText(verdict.rationale, BAND_RATIONALE_MAX_LENGTH),
    agentVotes: verdict.agentVotes.map((vote) => ({
      ...vote,
      rationale: sanitizedVerdictText(vote.rationale, BAND_VOTE_RATIONALE_MAX_LENGTH),
    })),
  }
}

function policyVerdictJson(content: string): string | null {
  // Band persists structured mentions as leading @[[participant-id]] tokens.
  // They are delivery metadata, not part of the policy-authored payload.
  const normalized = content.replace(/^(?:@\[\[[^\]\r\n]{1,256}\]\]\s*)+/, '').trimStart()
  if (!normalized.startsWith(BAND_VERDICT_PREFIX)) return null
  return normalized.slice(BAND_VERDICT_PREFIX.length).trim().replace(/^:\s*/, '')
}

export function parsePolicyVerdict(
  messages: readonly PlatformChatMessage[],
  policyAgentId: string,
): NegotiationVerdict | null {
  for (const message of [...messages].reverse()) {
    if (message.sender_id !== policyAgentId) continue
    const json = policyVerdictJson(message.content)
    if (json === null) continue
    try {
      const parsed = negotiationVerdictSchema.safeParse(JSON.parse(json))
      if (parsed.success) return sanitizeNegotiationVerdict(parsed.data)
    } catch {
      // Ignore incomplete or non-JSON policy messages while the external agents are working.
    }
  }
  return null
}

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null
}

const REQUIRED_BAND_BRAIN = { runtime: 'CODEX', model: 'gpt-5.6-sol' } as const

function hasRequiredMessageBrain(message: PlatformChatMessage): boolean {
  const normalized = message.content.replace(/^(?:@\[\[[^\]\r\n]{1,256}\]\]\s*)+/, '').trimStart()
  const marker = normalized.match(/^\[ZHC_BRAIN\s+runtime=([^\s\]]+)\s+model=([^\s\]]+)\]/)
  return marker?.[1] === REQUIRED_BAND_BRAIN.runtime && marker[2] === REQUIRED_BAND_BRAIN.model
}

function hasRequiredVerdictBrain(parsedJson: unknown): boolean {
  const proof = record(record(parsedJson)?.ZHC_BRAIN)
  return proof?.runtime === REQUIRED_BAND_BRAIN.runtime && proof.model === REQUIRED_BAND_BRAIN.model
}

function orderedMessages(messages: readonly PlatformChatMessage[]): PlatformChatMessage[] {
  return messages
    .map((message, index) => ({ message, index }))
    .sort((left, right) => {
      const timestampOrder = left.message.inserted_at.localeCompare(right.message.inserted_at)
      return timestampOrder || left.index - right.index
    })
    .map(({ message }) => message)
}

function completedPolicyOutcome(
  messages: readonly PlatformChatMessage[],
  agentIds: { researcher: string; negotiator: string; policyReviewer: string },
): { verdict: NegotiationVerdict; model: string | null; runtime: string | null } | null {
  const ordered = orderedMessages(messages)
  for (let policyIndex = ordered.length - 1; policyIndex >= 0; policyIndex -= 1) {
    const message = ordered[policyIndex]
    if (!message || message.sender_id !== agentIds.policyReviewer) continue
    const json = policyVerdictJson(message.content)
    if (json === null) continue
    let parsedJson: unknown
    try {
      parsedJson = JSON.parse(json)
    } catch {
      continue
    }
    const verdict = negotiationVerdictSchema.safeParse(parsedJson)
    if (!verdict.success || !hasRequiredVerdictBrain(parsedJson)) continue

    const researcherIndex = ordered.findIndex((candidate, index) => {
      return index < policyIndex
        && candidate.sender_id === agentIds.researcher
        && hasRequiredMessageBrain(candidate)
    })
    const negotiatorIndex = ordered.findIndex((candidate, index) => {
      return index > researcherIndex
        && index < policyIndex
        && candidate.sender_id === agentIds.negotiator
        && hasRequiredMessageBrain(candidate)
    })
    if (researcherIndex < 0 || negotiatorIndex < 0) continue

    return { verdict: sanitizeNegotiationVerdict(verdict.data), ...REQUIRED_BAND_BRAIN }
  }
  return null
}

function mention(identity: AgentIdentity): BandMention {
  return {
    id: identity.id,
    ...(identity.handle ? { handle: identity.handle } : {}),
    ...(identity.name ? { name: identity.name } : {}),
  }
}

function mentionLabel(identity: AgentIdentity): string {
  if (identity.handle) return identity.handle.startsWith('@') ? identity.handle : `@${identity.handle}`
  return `@${identity.name}`
}

function negotiationBrief(
  payload: BandNegotiationRequest,
  researcher: AgentIdentity,
  policy: AgentIdentity,
  operationId: string,
): string {
  const currency = sanitizeBandPersistedText(payload.currency, 16)
  const sellerContext = payload.askingPrice === undefined
    ? ''
    : `\nNegotiation price context: ${currency} ${payload.askingPrice}.`
  return [
    `Internal reconciliation marker: ${operationMarker(operationId)}.`,
    `Internal brief marker: ${briefMarker(operationId)}.`,
    `${mentionLabel(researcher)} research the negotiation context, then explicitly hand the evidence to the Negotiator.`,
    `${policy.name} must receive the Negotiator's proposal before independently enforcing the local policy and publishing the final verdict.`,
    `Brief: ${sanitizeBandPersistedText(payload.brief)}`,
    `Currency: ${currency}.${sellerContext}`,
    `Local policy (authoritative): ${sanitizeBandPersistedText(payload.localPolicy)}`,
    `Only ${policy.name} may finalize. The verdict must begin with ${BAND_VERDICT_PREFIX} followed by JSON matching the required verdict schema.`,
  ].join('\n')
}

export function sanitizeBandPersistedText(value: string, maxLength = 1_200): string {
  return sanitizeSensitiveText(value, maxLength)
}

export class BandExternalAgentProvider implements ProviderPort<BandNegotiationRequest, BandNegotiationResult> {
  readonly provider = 'BAND' as const
  private readonly coordinator: BandExternalCoordinator

  constructor(
    private readonly config: BandConfig,
    coordinator?: BandExternalCoordinator,
    private readonly sleep: BandSleep = defaultSleep,
  ) {
    this.coordinator = coordinator ?? new ThenvoiExternalCoordinator(config)
  }

  capabilities(): ProviderCapabilities {
    return { live: true, idempotency: 'reconcile', operations: ['external_agents.negotiate'] }
  }

  async preflight(): Promise<void> {
    requireConfig(this.provider, {
      BAND_NEGOTIATOR_API_KEY: apiKeyFor(this.config, this.config.negotiatorAgentId ?? ''),
      BAND_RESEARCHER_API_KEY: apiKeyFor(this.config, this.config.researcherAgentId ?? ''),
      BAND_POLICY_AGENT_API_KEY: apiKeyFor(this.config, this.config.policyReviewerAgentId ?? ''),
      BAND_RESEARCHER_AGENT_ID: this.config.researcherAgentId,
      BAND_NEGOTIATOR_AGENT_ID: this.config.negotiatorAgentId,
      BAND_POLICY_AGENT_ID: this.config.policyReviewerAgentId,
    })
    await Promise.all([
      this.coordinator.getIdentity(this.config.negotiatorAgentId as string),
      this.coordinator.getIdentity(this.config.researcherAgentId as string),
      this.coordinator.getIdentity(this.config.policyReviewerAgentId as string),
    ])
  }

  async execute(
    request: ProviderRequest<BandNegotiationRequest>,
  ): Promise<ProviderResult<BandNegotiationResult>> {
    await this.preflight()
    const researcher = await this.coordinator.getIdentity(this.config.researcherAgentId as string)
    const policy = await this.coordinator.getIdentity(this.config.policyReviewerAgentId as string)
    const operationId = stableBandOperationId(request.idempotencyKey)
    let chatId: string
    try {
      chatId = (await this.coordinator.createChat()).id
    } catch {
      // Band cannot correlate an empty room to our deterministic operation ID:
      // task_id belongs to a separately-created Band Task, and the operation
      // marker cannot be written without the lost room ID. Persist a stable
      // manual-reconciliation hint so a retry never performs a blind create.
      throw new ProviderOutcomeUnknownError(
        'Band room creation outcome is unknown; manual reconciliation is required before retrying',
        createOutcomeUnknownHint(operationId),
      )
    }
    try {
      return await this.resumeChat(chatId, request.payload, researcher, policy, operationId)
    } catch (error) {
      if (error instanceof ProviderOutcomeUnknownError) throw error
      throw new ProviderOutcomeUnknownError(
        'Band external-agent coordination outcome is unknown; reconcile by stable operation marker before retrying',
        chatId,
      )
    }
  }

  async reconcile(
    idempotencyKey: string,
    context?: ProviderReconcileContext<BandNegotiationRequest>,
  ): Promise<ProviderResult<BandNegotiationResult> | null> {
    await this.preflight()
    const operationId = stableBandOperationId(idempotencyKey)
    const marker = operationMarker(operationId)
    const negotiatorId = this.config.negotiatorAgentId as string
    const chats = await this.coordinator.listChats()
    const contexts = new Map<string, PlatformChatMessage[]>()
    const markedChats: BandChat[] = []
    for (const chat of chats) {
      const messages = await this.coordinator.getChatContext(chat.id)
      contexts.set(chat.id, messages)
      if (messages.some((message) => message.sender_id === negotiatorId
        && message.message_type === 'text'
        && message.content.includes(marker))) markedChats.push(chat)
    }
    if (markedChats.length > 1) {
      throw new ProviderOutcomeUnknownError('Band reconciliation found multiple rooms for one operation marker')
    }

    let chat = markedChats[0]
    const unknownCreateHint = createOutcomeUnknownHint(operationId)
    if (!chat && context?.externalHint === unknownCreateHint) {
      throw new ProviderOutcomeUnknownError(
        'Band room creation cannot be reconciled automatically because the accepted room has no operation marker; manual reconciliation is required',
        unknownCreateHint,
      )
    }
    if (!chat && context?.externalHint) {
      const hintedId = context.externalHint.replace(/^band:/i, '')
      const hintedChat = chats.find((candidate) => candidate.id === hintedId)
      if (!hintedChat) return null
      chat = hintedChat
    }
    if (!chat) return null

    const messages = contexts.get(chat.id) ?? await this.coordinator.getChatContext(chat.id)
    const outcome = completedPolicyOutcome(messages, this.agentIds())
    const knownBrief = this.briefMessage(messages, operationId)
    if (outcome) return this.result(chat.id, knownBrief?.id ?? null, outcome)
    const payload = bandNegotiationRequestSchema.safeParse(context?.payload)
    if (!payload.success) {
      throw new ProviderOutcomeUnknownError('Band reconciliation needs the original negotiation request', chat.id)
    }
    const researcher = await this.coordinator.getIdentity(this.config.researcherAgentId as string)
    const policy = await this.coordinator.getIdentity(this.config.policyReviewerAgentId as string)
    return this.resumeChat(chat.id, payload.data, researcher, policy, operationId)
  }

  private async resumeChat(
    chatId: string,
    payload: BandNegotiationRequest,
    researcher: AgentIdentity,
    policy: AgentIdentity,
    operationId: string,
  ): Promise<ProviderResult<BandNegotiationResult>> {
    const participants = await this.coordinator.listParticipants(chatId)
    const participantIds = new Set(participants.map((participant) => participant.id))
    if (!participantIds.has(researcher.id)) {
      await this.coordinator.addParticipant(chatId, researcher.id, 'member')
    }
    if (!participantIds.has(policy.id)) {
      await this.coordinator.addParticipant(chatId, policy.id, 'member')
    }

    const messages = await this.coordinator.getChatContext(chatId)
    let brief = this.briefMessage(messages, operationId)
    if (!brief) {
      const sent = await this.coordinator.sendMessage(
        chatId,
        negotiationBrief(payload, researcher, policy, operationId),
        [mention(researcher)],
      )
      brief = sent.id ? { id: sent.id } : null
    }
    const outcome = completedPolicyOutcome(messages, this.agentIds()) ?? await this.pollForVerdict(chatId)
    return this.result(chatId, brief?.id ?? null, outcome)
  }

  private briefMessage(
    messages: readonly PlatformChatMessage[],
    operationId: string,
  ): Pick<PlatformChatMessage, 'id'> | null {
    const negotiatorId = this.config.negotiatorAgentId as string
    return messages.find((message) => message.sender_id === negotiatorId
      && message.message_type === 'text'
      && message.content.includes(briefMarker(operationId))) ?? null
  }

  private async pollForVerdict(chatId: string): Promise<{
    verdict: NegotiationVerdict
    model: string | null
    runtime: string | null
  }> {
    const pollIntervalMs = Math.max(1, this.config.pollIntervalMs ?? 2_000)
    const maxPollDurationMs = Math.min(Math.max(0, this.config.maxPollDurationMs ?? 180_000), 180_000)
    let elapsedMs = 0

    while (elapsedMs <= maxPollDurationMs) {
      const messages = await this.coordinator.getChatContext(chatId)
      const outcome = completedPolicyOutcome(messages, this.agentIds())
      if (outcome) return outcome
      if (elapsedMs === maxPollDurationMs) break
      const waitMs = Math.min(pollIntervalMs, maxPollDurationMs - elapsedMs)
      await this.sleep(waitMs)
      elapsedMs += waitMs
    }

    throw new ProviderOutcomeUnknownError(
      'Band external agents did not return a valid policy-authored verdict within three minutes; reconcile before retrying',
      chatId,
    )
  }

  private result(
    chatId: string,
    briefMessageId: string | null,
    outcome: { verdict: NegotiationVerdict; model: string | null; runtime: string | null },
  ): ProviderResult<BandNegotiationResult> {
    const externalAgentIds = this.agentIds()
    return {
      provider: this.provider,
      externalId: sanitizedExternalId(this.provider, chatId),
      live: true,
      status: 'COMPLETE',
      data: {
        roomId: chatId,
        briefMessageId,
        verdict: outcome.verdict,
        externalAgentIds,
        model: outcome.model,
        runtime: outcome.runtime,
        localPolicyAuthoritative: true,
      },
      redacted: {
        roomId: chatId,
        briefMessageId,
        externalAgentIds,
        model: outcome.model,
        runtime: outcome.runtime,
        localPolicyAuthoritative: true,
      },
    }
  }

  private agentIds(): { negotiator: string; researcher: string; policyReviewer: string } {
    return {
      negotiator: this.config.negotiatorAgentId as string,
      researcher: this.config.researcherAgentId as string,
      policyReviewer: this.config.policyReviewerAgentId as string,
    }
  }
}

export { BandExternalAgentProvider as BandHostedAgentProvider }
