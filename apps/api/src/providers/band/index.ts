import { ThenvoiLink } from '@band-ai/sdk'
import type { AgentIdentity, PlatformChatMessage } from '@band-ai/sdk/rest'
import { z } from 'zod'
import {
  ProviderOutcomeUnknownError,
  requireConfig,
  sanitizedExternalId,
  type ProviderCapabilities,
  type ProviderPort,
  type ProviderRequest,
  type ProviderResult,
} from '../types.js'

export const BAND_VERDICT_PREFIX = 'ZHC_VERDICT'

export const negotiationVerdictSchema = z.object({
  recommendation: z.enum(['ACCEPT', 'COUNTER', 'REJECT', 'ESCALATE']),
  proposedPrice: z.number().nonnegative().nullable(),
  risks: z.array(z.string().min(1)),
  rationale: z.string().min(1),
  agentVotes: z.array(z.object({
    agentId: z.string().min(1),
    vote: z.enum(['ACCEPT', 'COUNTER', 'REJECT', 'ESCALATE']),
    rationale: z.string().min(1),
  })).min(1),
})

export type NegotiationVerdict = z.infer<typeof negotiationVerdictSchema>

export type BandNegotiationRequest = {
  brief: string
  currency: string
  askingPrice?: number
  localPolicy: string
}

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
  createChat(taskId: string): Promise<{ id: string }>
  addParticipant(chatId: string, participantId: string, role: 'member'): Promise<void>
  sendMessage(chatId: string, content: string, mentions: BandMention[]): Promise<{ id: string | null }>
  getChatContext(chatId: string): Promise<PlatformChatMessage[]>
  listChats(): Promise<BandChat[]>
}

type BandSleep = (milliseconds: number) => Promise<void>

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

  async createChat(taskId: string): Promise<{ id: string }> {
    return this.negotiator().rest.createChat(taskId)
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
    const getChatContext = this.negotiator().rest.getChatContext
    if (!getChatContext) throw new Error('Band SDK REST context hydration is unavailable')
    return (await getChatContext({ chatId, page: 1, pageSize: 100 })).data
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

export function parsePolicyVerdict(
  messages: readonly PlatformChatMessage[],
  policyAgentId: string,
): NegotiationVerdict | null {
  for (const message of [...messages].reverse()) {
    if (message.sender_id !== policyAgentId || !message.content.startsWith(BAND_VERDICT_PREFIX)) continue
    const json = message.content.slice(BAND_VERDICT_PREFIX.length).trim().replace(/^:\s*/, '')
    try {
      const parsed = negotiationVerdictSchema.safeParse(JSON.parse(json))
      if (parsed.success) return parsed.data
    } catch {
      // Ignore incomplete or non-JSON policy messages while the external agents are working.
    }
  }
  return null
}

function messageRuntime(message: PlatformChatMessage, parsedJson?: unknown): { model: string | null; runtime: string | null } {
  let model: string | null = null
  let runtime: string | null = null
  const metadata = message.metadata ?? {}
  let authoredModel = metadata.model ?? metadata.model_id ?? metadata.brain
  let authoredRuntime = metadata.runtime ?? metadata.sdk ?? metadata.agent_runtime
  const marker = message.content.match(/\[ZHC_BRAIN\s+runtime=([^\s\]]+)\s+model=([^\s\]]+)\]/i)
  if (marker) {
    authoredRuntime = marker[1]
    authoredModel = marker[2]
  }
  const proof = record(parsedJson)?.ZHC_BRAIN
  if (proof && typeof proof === 'object' && !Array.isArray(proof)) {
    authoredRuntime = (proof as Record<string, unknown>).runtime ?? authoredRuntime
    authoredModel = (proof as Record<string, unknown>).model ?? authoredModel
  }
  if (typeof authoredModel === 'string' && authoredModel.trim()) model = authoredModel.trim()
  if (typeof authoredRuntime === 'string' && authoredRuntime.trim()) runtime = authoredRuntime.trim()
  return { model, runtime }
}

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null
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
    if (!message || message.sender_id !== agentIds.policyReviewer || !message.content.startsWith(BAND_VERDICT_PREFIX)) continue
    const json = message.content.slice(BAND_VERDICT_PREFIX.length).trim().replace(/^:\s*/, '')
    let parsedJson: unknown
    try {
      parsedJson = JSON.parse(json)
    } catch {
      continue
    }
    const verdict = negotiationVerdictSchema.safeParse(parsedJson)
    if (!verdict.success) continue

    const researcherIndex = ordered.findIndex((candidate, index) => {
      return index < policyIndex && candidate.sender_id === agentIds.researcher
    })
    const negotiatorIndex = ordered.findIndex((candidate, index) => {
      return index > researcherIndex && index < policyIndex && candidate.sender_id === agentIds.negotiator
    })
    if (researcherIndex < 0 || negotiatorIndex < 0) continue

    return { verdict: verdict.data, ...messageRuntime(message, parsedJson) }
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
): string {
  const currency = sanitizeBandPersistedText(payload.currency, 16)
  const sellerContext = payload.askingPrice === undefined
    ? ''
    : `\nNegotiation price context: ${currency} ${payload.askingPrice}.`
  return [
    `${mentionLabel(researcher)} research the negotiation context, then explicitly hand the evidence to the Negotiator.`,
    `${policy.name} must receive the Negotiator's proposal before independently enforcing the local policy and publishing the final verdict.`,
    `Brief: ${sanitizeBandPersistedText(payload.brief)}`,
    `Currency: ${currency}.${sellerContext}`,
    `Local policy (authoritative): ${sanitizeBandPersistedText(payload.localPolicy)}`,
    `Only ${policy.name} may finalize. The verdict must begin with ${BAND_VERDICT_PREFIX} followed by JSON matching the required verdict schema.`,
  ].join('\n')
}

export function sanitizeBandPersistedText(value: string, maxLength = 1_200): string {
  return value
    .replace(/\bBearer\s+[^\s"']+/gi, 'Bearer [REDACTED_SECRET]')
    .replace(/\bsk-[A-Za-z0-9_-]{8,}\b/g, '[REDACTED_SECRET]')
    .replace(/\b(api[_ -]?key|token|secret|password)\s*[:=]\s*[^\s,;]+/gi, '$1=[REDACTED_SECRET]')
    .replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, '[REDACTED_EMAIL]')
    .replace(/https?:\/\/[^\s<>()]+/gi, '[REDACTED_URL]')
    .replace(/(?<!\w)(?:\+?\d[\d ().-]{7,}\d)(?!\w)/g, '[REDACTED_PHONE]')
    .replace(/[\u0000-\u001f\u007f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, maxLength)
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
      BAND_POLICY_REVIEWER_AGENT_ID: this.config.policyReviewerAgentId,
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
    let chatId: string | null = null
    try {
      chatId = (await this.coordinator.createChat(request.idempotencyKey)).id
      await this.coordinator.addParticipant(chatId, researcher.id, 'member')
      await this.coordinator.addParticipant(chatId, policy.id, 'member')
      const sent = await this.coordinator.sendMessage(
        chatId,
        negotiationBrief(request.payload, researcher, policy),
        [mention(researcher)],
      )
      const outcome = await this.pollForVerdict(chatId)
      return this.result(chatId, sent.id, outcome)
    } catch (error) {
      if (error instanceof ProviderOutcomeUnknownError) throw error
      throw new ProviderOutcomeUnknownError(
        'Band external-agent coordination outcome is unknown; reconcile by stable task ID before retrying',
        chatId ?? request.idempotencyKey,
      )
    }
  }

  async reconcile(idempotencyKey: string): Promise<ProviderResult<BandNegotiationResult> | null> {
    await this.preflight()
    const chat = (await this.coordinator.listChats()).find((candidate) => candidate.taskId === idempotencyKey)
    if (!chat) return null
    const outcome = await this.pollForVerdict(chat.id)
    return this.result(chat.id, null, outcome)
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
      const outcome = completedPolicyOutcome(messages, {
        researcher: this.config.researcherAgentId as string,
        negotiator: this.config.negotiatorAgentId as string,
        policyReviewer: this.config.policyReviewerAgentId as string,
      })
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
    const externalAgentIds = {
      negotiator: this.config.negotiatorAgentId as string,
      researcher: this.config.researcherAgentId as string,
      policyReviewer: this.config.policyReviewerAgentId as string,
    }
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
}

export { BandExternalAgentProvider as BandHostedAgentProvider }
