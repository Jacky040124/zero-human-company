import type { AgentIdentity, PlatformChatMessage } from '@band-ai/sdk/rest'
import { describe, expect, it, vi } from 'vitest'
import {
  BandExternalAgentProvider,
  type BandChat,
  type BandExternalCoordinator,
  type BandMention,
  bandNegotiationResultSchema,
  negotiationVerdictSchema,
  parsePolicyVerdict,
  sanitizeBandPersistedText,
  validateNegotiationVerdict,
} from './index.js'

const validVerdict = {
  recommendation: 'COUNTER' as const,
  proposedPrice: 172,
  risks: ['Delivery timing'],
  rationale: 'The price is within local policy.',
  agentVotes: [
    { agentId: 'researcher', vote: 'COUNTER' as const, rationale: 'Evidence supports it.' },
    { agentId: 'negotiator', vote: 'COUNTER' as const, rationale: 'Terms remain workable.' },
    { agentId: 'policy', vote: 'ACCEPT' as const, rationale: 'It meets the floor.' },
  ],
}

const config = {
  baseUrl: 'https://api.thenvoi.example',
  apiKey: 'secret',
  researcherAgentId: 'researcher',
  negotiatorAgentId: 'negotiator',
  policyReviewerAgentId: 'policy',
  pollIntervalMs: 10,
  maxPollDurationMs: 30,
}

function identity(id: string): AgentIdentity {
  return { id, name: `${id} agent`, handle: `team/${id}`, description: null }
}

function message(
  senderId: string,
  content: string,
  id: string = crypto.randomUUID(),
  metadata?: Record<string, unknown>,
): PlatformChatMessage {
  return {
    id,
    content,
    sender_id: senderId,
    sender_type: 'agent',
    message_type: 'text',
    inserted_at: new Date().toISOString(),
    metadata,
  }
}

class FakeCoordinator implements BandExternalCoordinator {
  readonly participants: Array<{ chatId: string; participantId: string; role: 'member' }> = []
  readonly sent: Array<{ chatId: string; content: string; mentions: BandMention[] }> = []
  readonly createdTasks: string[] = []
  contexts: PlatformChatMessage[][] = []
  chats: BandChat[] = []

  async getIdentity(agentId: string): Promise<AgentIdentity> {
    return identity(agentId)
  }

  async createChat(taskId: string): Promise<{ id: string }> {
    this.createdTasks.push(taskId)
    return { id: 'chat-1' }
  }

  async addParticipant(chatId: string, participantId: string, role: 'member'): Promise<void> {
    this.participants.push({ chatId, participantId, role })
  }

  async sendMessage(chatId: string, content: string, mentions: BandMention[]): Promise<{ id: string }> {
    this.sent.push({ chatId, content, mentions })
    return { id: 'brief-1' }
  }

  async getChatContext(): Promise<PlatformChatMessage[]> {
    return this.contexts.shift() ?? []
  }

  async listChats(): Promise<BandChat[]> {
    return this.chats
  }
}

describe('Band verdict schema', () => {
  it('requires recommendation, price, risks, rationale, and agent votes', () => {
    expect(validateNegotiationVerdict(validVerdict)).toEqual(validVerdict)
    expect(negotiationVerdictSchema.safeParse({ recommendation: 'ACCEPT', rationale: 'Incomplete' }).success).toBe(false)
  })

  it('requires external identities and nullable transcript-derived runtime proof', () => {
    expect(bandNegotiationResultSchema.safeParse({
      roomId: 'chat-1',
      briefMessageId: 'brief-1',
      verdict: validVerdict,
      externalAgentIds: { negotiator: 'negotiator', researcher: 'researcher', policyReviewer: 'policy' },
      model: null,
      runtime: null,
      localPolicyAuthoritative: true,
    }).success).toBe(true)
  })
})

describe('policy-authored verdict parsing', () => {
  it('accepts only prefixed, schema-valid JSON from the configured policy agent', () => {
    const content = `ZHC_VERDICT ${JSON.stringify(validVerdict)}`
    expect(parsePolicyVerdict([
      message('negotiator', content),
      message('policy', 'ordinary policy discussion'),
      message('policy', 'ZHC_VERDICT {"recommendation":"COUNTER"}'),
      message('policy', content),
    ], 'policy')).toEqual(validVerdict)
    expect(parsePolicyVerdict([message('researcher', content)], 'policy')).toBeNull()
  })
})

describe('Band external-agent coordination', () => {
  it('creates a stable task chat, adds members, and sends valid identity mentions', async () => {
    const coordinator = new FakeCoordinator()
    coordinator.contexts = [[
      message('researcher', '[ZHC_BRAIN runtime=CODEX model=gpt-5.6-sol] Research complete.'),
      message('negotiator', '[ZHC_BRAIN runtime=CODEX model=gpt-5.6-sol] Proposal ready for Policy Reviewer.'),
      message('policy', `ZHC_VERDICT ${JSON.stringify({ ...validVerdict, ZHC_BRAIN: { model: 'gpt-5.6-sol', runtime: 'CODEX' } })}`),
    ]]
    const provider = new BandExternalAgentProvider(config, coordinator, vi.fn(async () => {}))

    const result = await provider.execute({
      demoRunId: 'demo-1',
      idempotencyKey: 'idem-1',
      payload: { brief: 'Verified inbound brief.', currency: 'EUR', localPolicy: 'Floor EUR 158.' },
    })

    expect(provider.capabilities().operations).toEqual(['external_agents.negotiate'])
    expect(coordinator.createdTasks).toEqual(['idem-1'])
    expect(coordinator.participants).toEqual([
      { chatId: 'chat-1', participantId: 'researcher', role: 'member' },
      { chatId: 'chat-1', participantId: 'policy', role: 'member' },
    ])
    expect(coordinator.sent[0]?.mentions).toEqual([
      { id: 'researcher', handle: 'team/researcher', name: 'researcher agent' },
    ])
    expect(coordinator.sent[0]?.content).toContain('@team/researcher')
    expect(coordinator.sent[0]?.content).toContain('policy agent')
    expect(coordinator.sent[0]?.content).not.toContain('@team/policy')
    expect(result.data.externalAgentIds).toEqual({
      negotiator: 'negotiator',
      researcher: 'researcher',
      policyReviewer: 'policy',
    })
    expect(result.data.model).toBe('gpt-5.6-sol')
    expect(result.data.runtime).toBe('CODEX')
    expect(result.data.localPolicyAuthoritative).toBe(true)
  })

  it('does not claim a model or runtime when the transcript does not provide them', async () => {
    const coordinator = new FakeCoordinator()
    coordinator.contexts = [[
      message('researcher', 'Research complete.'),
      message('negotiator', 'Proposal ready.'),
      message('policy', `ZHC_VERDICT ${JSON.stringify(validVerdict)}`),
    ]]
    const provider = new BandExternalAgentProvider(config, coordinator, vi.fn(async () => {}))

    const result = await provider.execute({
      demoRunId: 'demo-no-runtime',
      idempotencyKey: 'idem-no-runtime',
      payload: { brief: 'Brief', currency: 'EUR', localPolicy: 'Policy' },
    })

    expect(result.data.model).toBeNull()
    expect(result.data.runtime).toBeNull()
  })

  it('uses the policy verdict author runtime instead of an earlier role runtime', async () => {
    const coordinator = new FakeCoordinator()
    coordinator.contexts = [[
      message('researcher', '[ZHC_BRAIN runtime=CODEX model=gpt-5.6-sol] Research complete.'),
      message('negotiator', '[ZHC_BRAIN runtime=CODEX model=gpt-5.6-sol] Proposal ready.'),
      message('policy', `ZHC_VERDICT ${JSON.stringify({
        ...validVerdict,
        ZHC_BRAIN: { model: 'gpt-5.6-luna', runtime: 'RESPONSES' },
      })}`),
    ]]
    const provider = new BandExternalAgentProvider(config, coordinator, vi.fn(async () => {}))

    const result = await provider.execute({
      demoRunId: 'demo-policy-runtime',
      idempotencyKey: 'idem-policy-runtime',
      payload: { brief: 'Brief', currency: 'EUR', localPolicy: 'Policy' },
    })

    expect(result.data.model).toBe('gpt-5.6-luna')
    expect(result.data.runtime).toBe('RESPONSES')
  })

  it('binds runtime proof to the exact final policy verdict message', async () => {
    const coordinator = new FakeCoordinator()
    coordinator.contexts = [[
      message('researcher', 'Research complete.'),
      message('negotiator', 'Proposal ready.'),
      message('policy', '[ZHC_BRAIN runtime=CODEX model=gpt-5.6-sol] Policy discussion.'),
      message('policy', `ZHC_VERDICT ${JSON.stringify(validVerdict)}`),
    ]]
    const provider = new BandExternalAgentProvider(config, coordinator, vi.fn(async () => {}))

    const result = await provider.execute({
      demoRunId: 'demo-exact-proof',
      idempotencyKey: 'idem-exact-proof',
      payload: { brief: 'Brief', currency: 'EUR', localPolicy: 'Policy' },
    })

    expect(result.data.model).toBeNull()
    expect(result.data.runtime).toBeNull()
  })

  it('does not complete without a Negotiator response between Researcher and Policy', async () => {
    const coordinator = new FakeCoordinator()
    coordinator.contexts = Array.from({ length: 4 }, () => [
      message('researcher', 'Research complete.'),
      message('policy', `ZHC_VERDICT ${JSON.stringify(validVerdict)}`),
    ])
    const provider = new BandExternalAgentProvider(config, coordinator, vi.fn(async () => {}))

    await expect(provider.execute({
      demoRunId: 'demo-no-negotiator',
      idempotencyKey: 'idem-no-negotiator',
      payload: { brief: 'Brief', currency: 'EUR', localPolicy: 'Policy' },
    })).rejects.toMatchObject({ name: 'ProviderOutcomeUnknownError', externalHint: 'chat-1' })
  })

  it('redacts secrets and contact details before persisting the brief to Band', async () => {
    const coordinator = new FakeCoordinator()
    coordinator.contexts = [[
      message('researcher', 'Research complete.'),
      message('negotiator', 'Proposal ready.'),
      message('policy', `ZHC_VERDICT ${JSON.stringify(validVerdict)}`),
    ]]
    const provider = new BandExternalAgentProvider(config, coordinator, vi.fn(async () => {}))
    const sensitive = 'jane@example.com +1 (415) 555-1212 Bearer abc123 token=topsecret sk-abcdefghijklmnop https://private.example/x'

    await provider.execute({
      demoRunId: 'demo-redaction',
      idempotencyKey: 'idem-redaction',
      payload: { brief: sensitive, currency: 'EUR', localPolicy: `Floor 158; api_key=local-secret ${sensitive}` },
    })

    const persisted = coordinator.sent[0]?.content ?? ''
    for (const secret of ['jane@example.com', '555-1212', 'abc123', 'topsecret', 'sk-abcdefghijklmnop', 'private.example', 'local-secret']) {
      expect(persisted).not.toContain(secret)
    }
    expect(sanitizeBandPersistedText(sensitive)).toContain('[REDACTED_SECRET]')
  })

  it('times out after the bounded polling window', async () => {
    const coordinator = new FakeCoordinator()
    const sleep = vi.fn(async () => {})
    const provider = new BandExternalAgentProvider(config, coordinator, sleep)

    await expect(provider.execute({
      demoRunId: 'demo-2',
      idempotencyKey: 'idem-2',
      payload: { brief: 'Brief', currency: 'EUR', localPolicy: 'Policy' },
    })).rejects.toMatchObject({ name: 'ProviderOutcomeUnknownError', externalHint: 'chat-1' })
    expect(sleep).toHaveBeenCalledTimes(3)
  })

  it('reconciles by stable task ID and polls without creating or sending', async () => {
    const coordinator = new FakeCoordinator()
    coordinator.chats = [
      { id: 'other-chat', taskId: 'other-task' },
      { id: 'existing-chat', taskId: 'idem-existing' },
    ]
    coordinator.contexts = [[
      message('researcher', 'Research complete.'),
      message('negotiator', 'Proposal ready.'),
      message('policy', `ZHC_VERDICT ${JSON.stringify(validVerdict)}`),
    ]]
    const provider = new BandExternalAgentProvider(config, coordinator, vi.fn(async () => {}))

    const result = await provider.reconcile('idem-existing')

    expect(result?.data.roomId).toBe('existing-chat')
    expect(coordinator.createdTasks).toEqual([])
    expect(coordinator.sent).toEqual([])
    expect(coordinator.participants).toEqual([])
  })
})
