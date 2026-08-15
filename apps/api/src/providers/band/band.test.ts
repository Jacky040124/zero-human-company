import type { AgentIdentity, PlatformChatMessage } from '@band-ai/sdk/rest'
import { describe, expect, it, vi } from 'vitest'
import {
  BandExternalAgentProvider,
  type BandChat,
  type BandExternalCoordinator,
  type BandMention,
  ThenvoiExternalCoordinator,
  bandNegotiationResultSchema,
  negotiationVerdictSchema,
  parsePolicyVerdict,
  sanitizeBandPersistedText,
  stableBandOperationId,
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

const brainMarker = '[ZHC_BRAIN runtime=CODEX model=gpt-5.6-sol]'
const policyVerdict = (verdict = validVerdict) => `ZHC_VERDICT ${JSON.stringify({
  ...verdict,
  ZHC_BRAIN: { runtime: 'CODEX', model: 'gpt-5.6-sol' },
})}`

function completedTranscript(): PlatformChatMessage[] {
  return [
    message('researcher', `${brainMarker} Research complete.`),
    message('negotiator', `${brainMarker} Proposal ready for Policy Reviewer.`),
    message('policy', policyVerdict()),
  ]
}

class FakeCoordinator implements BandExternalCoordinator {
  readonly participants: Array<{ chatId: string; participantId: string; role: 'member' }> = []
  readonly sent: Array<{ chatId: string; content: string; mentions: BandMention[] }> = []
  createdChats = 0
  contexts: PlatformChatMessage[][] = []
  chats: BandChat[] = []
  createError: Error | null = null

  async getIdentity(agentId: string): Promise<AgentIdentity> {
    return identity(agentId)
  }

  async createChat(): Promise<{ id: string }> {
    this.createdChats += 1
    if (this.createError) throw this.createError
    return { id: 'chat-1' }
  }

  async listParticipants(): Promise<Array<{ id: string }>> {
    return [
      { id: 'negotiator' },
      ...this.participants.map((participant) => ({ id: participant.participantId })),
    ]
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
  it('maps ordinary idempotency keys to deterministic non-sensitive operation IDs', () => {
    const operationId = stableBandOperationId('demo-run:band-negotiation')
    expect(operationId).toMatch(/^[0-9a-f]{32}$/)
    expect(stableBandOperationId('demo-run:band-negotiation')).toBe(operationId)
    expect(stableBandOperationId('other-run:band-negotiation')).not.toBe(operationId)
  })

  it('requires recommendation, price, risks, rationale, and agent votes', () => {
    expect(validateNegotiationVerdict(validVerdict)).toEqual(validVerdict)
    expect(negotiationVerdictSchema.safeParse({ recommendation: 'ACCEPT', rationale: 'Incomplete' }).success).toBe(false)
  })

  it('rejects overlong free-form verdict text', () => {
    expect(negotiationVerdictSchema.safeParse({
      ...validVerdict,
      rationale: 'x'.repeat(2_001),
    }).success).toBe(false)
    expect(negotiationVerdictSchema.safeParse({
      ...validVerdict,
      risks: ['x'.repeat(501)],
    }).success).toBe(false)
    expect(negotiationVerdictSchema.safeParse({
      ...validVerdict,
      agentVotes: [{ ...validVerdict.agentVotes[0], rationale: 'x'.repeat(1_001) }],
    }).success).toBe(false)
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
    expect(parsePolicyVerdict([
      message('policy', `@[[negotiator]] ${content}`),
    ], 'policy')).toEqual(validVerdict)
    expect(parsePolicyVerdict([message('researcher', content)], 'policy')).toBeNull()
  })
})

describe('Band external-agent coordination', () => {
  it('reports the actual policy agent environment variable when configuration is missing', async () => {
    const provider = new BandExternalAgentProvider(
      { ...config, policyReviewerAgentId: undefined },
      new FakeCoordinator(),
      vi.fn(async () => {}),
    )

    await expect(provider.preflight()).rejects.toThrow(/BAND_POLICY_AGENT_ID/)
    await expect(provider.preflight()).rejects.not.toThrow(/BAND_POLICY_REVIEWER_AGENT_ID/)
  })

  it('creates a stable task chat, adds members, and sends valid identity mentions', async () => {
    const coordinator = new FakeCoordinator()
    const transcript = completedTranscript()
    transcript[2] = message('policy', `@[[negotiator]] ${policyVerdict()}`)
    coordinator.contexts = [transcript]
    const provider = new BandExternalAgentProvider(config, coordinator, vi.fn(async () => {}))

    const result = await provider.execute({
      demoRunId: 'demo-1',
      idempotencyKey: 'idem-1',
      payload: { brief: 'Verified inbound brief.', currency: 'EUR', localPolicy: 'Floor EUR 158.' },
    })

    expect(provider.capabilities().operations).toEqual(['external_agents.negotiate'])
    expect(coordinator.createdChats).toBe(1)
    expect(coordinator.sent[0]?.content).toContain(`ZHC_OPERATION_ID:${stableBandOperationId('idem-1')}`)
    expect(coordinator.sent[0]?.content).toContain(`ZHC_BRIEF_ID:${stableBandOperationId('idem-1')}`)
    expect(coordinator.sent[0]?.content).not.toContain('idem-1')
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

  it('fails closed when the transcript does not provide role-authored runtime proof', async () => {
    const coordinator = new FakeCoordinator()
    coordinator.contexts = [[
      message('researcher', 'Research complete.'),
      message('negotiator', 'Proposal ready.'),
      message('policy', `ZHC_VERDICT ${JSON.stringify(validVerdict)}`),
    ]]
    const provider = new BandExternalAgentProvider(config, coordinator, vi.fn(async () => {}))

    await expect(provider.execute({
      demoRunId: 'demo-no-runtime',
      idempotencyKey: 'idem-no-runtime',
      payload: { brief: 'Brief', currency: 'EUR', localPolicy: 'Policy' },
    })).rejects.toMatchObject({ name: 'ProviderOutcomeUnknownError', externalHint: 'chat-1' })
  })

  it('does not treat message metadata as transcript-authored proof', async () => {
    const coordinator = new FakeCoordinator()
    const metadata = { runtime: 'CODEX', model: 'gpt-5.6-sol' }
    coordinator.contexts = [[
      message('researcher', 'Research complete.', undefined, metadata),
      message('negotiator', 'Proposal ready.', undefined, metadata),
      message('policy', `ZHC_VERDICT ${JSON.stringify(validVerdict)}`, undefined, metadata),
    ]]
    const provider = new BandExternalAgentProvider(config, coordinator, vi.fn(async () => {}))

    await expect(provider.execute({
      demoRunId: 'demo-metadata-proof',
      idempotencyKey: 'idem-metadata-proof',
      payload: { brief: 'Brief', currency: 'EUR', localPolicy: 'Policy' },
    })).rejects.toMatchObject({ name: 'ProviderOutcomeUnknownError', externalHint: 'chat-1' })
  })

  it.each([
    ['Researcher', 'researcher'],
    ['Negotiator', 'negotiator'],
  ] as const)('fails closed when the %s proof is not Codex/Sol', async (_role, senderId) => {
    const coordinator = new FakeCoordinator()
    const transcript = completedTranscript()
    const proofIndex = senderId === 'researcher' ? 0 : 1
    transcript[proofIndex] = message(senderId, '[ZHC_BRAIN runtime=RESPONSES model=gpt-5.6-luna] Untrusted role output.')
    coordinator.contexts = [transcript]
    const provider = new BandExternalAgentProvider(config, coordinator, vi.fn(async () => {}))

    await expect(provider.execute({
      demoRunId: `demo-wrong-${senderId}-runtime`,
      idempotencyKey: `idem-wrong-${senderId}-runtime`,
      payload: { brief: 'Brief', currency: 'EUR', localPolicy: 'Policy' },
    })).rejects.toMatchObject({ name: 'ProviderOutcomeUnknownError', externalHint: 'chat-1' })
  })

  it('fails closed when the Policy verdict proof is not Codex/Sol', async () => {
    const coordinator = new FakeCoordinator()
    const transcript = completedTranscript()
    transcript[2] = message('policy', `ZHC_VERDICT ${JSON.stringify({
      ...validVerdict,
      ZHC_BRAIN: { model: 'gpt-5.6-luna', runtime: 'RESPONSES' },
    })}`)
    coordinator.contexts = [transcript]
    const provider = new BandExternalAgentProvider(config, coordinator, vi.fn(async () => {}))

    await expect(provider.execute({
      demoRunId: 'demo-policy-runtime',
      idempotencyKey: 'idem-policy-runtime',
      payload: { brief: 'Brief', currency: 'EUR', localPolicy: 'Policy' },
    })).rejects.toMatchObject({ name: 'ProviderOutcomeUnknownError', externalHint: 'chat-1' })
  })

  it('binds runtime proof to the exact final policy verdict message', async () => {
    const coordinator = new FakeCoordinator()
    coordinator.contexts = [[
      message('researcher', `${brainMarker} Research complete.`),
      message('negotiator', `${brainMarker} Proposal ready.`),
      message('policy', '[ZHC_BRAIN runtime=CODEX model=gpt-5.6-sol] Policy discussion.'),
      message('policy', `ZHC_VERDICT ${JSON.stringify(validVerdict)}`),
    ]]
    const provider = new BandExternalAgentProvider(config, coordinator, vi.fn(async () => {}))

    await expect(provider.execute({
      demoRunId: 'demo-exact-proof',
      idempotencyKey: 'idem-exact-proof',
      payload: { brief: 'Brief', currency: 'EUR', localPolicy: 'Policy' },
    })).rejects.toMatchObject({ name: 'ProviderOutcomeUnknownError', externalHint: 'chat-1' })
  })

  it('ignores proof from unrelated senders and rejects a wrong-order role chain', async () => {
    const coordinator = new FakeCoordinator()
    coordinator.contexts = [[
      message('negotiator', `${brainMarker} Proposal was authored too early.`),
      message('unrelated-negotiator', `${brainMarker} Copied Negotiator proof.`),
      message('researcher', `${brainMarker} Research arrived after negotiation.`),
      message('unrelated-policy', policyVerdict()),
      message('policy', policyVerdict()),
    ]]
    const provider = new BandExternalAgentProvider(config, coordinator, vi.fn(async () => {}))

    await expect(provider.execute({
      demoRunId: 'demo-wrong-order',
      idempotencyKey: 'idem-wrong-order',
      payload: { brief: 'Brief', currency: 'EUR', localPolicy: 'Policy' },
    })).rejects.toMatchObject({ name: 'ProviderOutcomeUnknownError', externalHint: 'chat-1' })
  })

  it('does not complete without a Negotiator response between Researcher and Policy', async () => {
    const coordinator = new FakeCoordinator()
    coordinator.contexts = Array.from({ length: 4 }, () => [
      message('researcher', `${brainMarker} Research complete.`),
      message('policy', policyVerdict()),
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
    coordinator.contexts = [completedTranscript()]
    const provider = new BandExternalAgentProvider(config, coordinator, vi.fn(async () => {}))
    const sensitive = 'jane@example.com +1 (415) 555-1212 Bearer abc123 token=topsecret sk-abcdefghijklmnop https://private.example/x {"apiKey":"json-key","password":"json-password"}'

    await provider.execute({
      demoRunId: 'demo-redaction',
      idempotencyKey: 'idem-redaction',
      payload: { brief: sensitive, currency: 'EUR', localPolicy: `Floor 158; api_key=local-secret ${sensitive}` },
    })

    const persisted = coordinator.sent.map((sent) => sent.content).join('\n')
    for (const secret of ['jane@example.com', '555-1212', 'abc123', 'topsecret', 'sk-abcdefghijklmnop', 'private.example', 'local-secret', 'json-key', 'json-password']) {
      expect(persisted).not.toContain(secret)
    }
    expect(sanitizeBandPersistedText(sensitive)).toContain('[REDACTED_SECRET]')
  })

  it('redacts dummy secrets and contact PII before returning verdict data', async () => {
    const coordinator = new FakeCoordinator()
    const sensitive = 'dummy@example.com +1 (415) 555-0101 token=dummy-verdict-secret'
    const verdict = {
      ...validVerdict,
      risks: [`Buyer contact: ${sensitive}`],
      rationale: `Policy rationale: ${sensitive}`,
      agentVotes: validVerdict.agentVotes.map((vote) => ({
        ...vote,
        rationale: `${vote.rationale} ${sensitive}`,
      })),
    }
    coordinator.contexts = [[
      message('researcher', `${brainMarker} Research complete.`),
      message('negotiator', `${brainMarker} Proposal ready for Policy Reviewer.`),
      message('policy', policyVerdict(verdict)),
    ]]
    const provider = new BandExternalAgentProvider(config, coordinator, vi.fn(async () => {}))

    const result = await provider.execute({
      demoRunId: 'demo-verdict-redaction',
      idempotencyKey: 'idem-verdict-redaction',
      payload: { brief: 'Brief', currency: 'EUR', localPolicy: 'Policy' },
    })

    const returnedVerdict = JSON.stringify(result.data.verdict)
    for (const sensitiveValue of ['dummy@example.com', '555-0101', 'dummy-verdict-secret']) {
      expect(returnedVerdict).not.toContain(sensitiveValue)
    }
    expect(returnedVerdict).toContain('[REDACTED_SECRET]')
    expect(returnedVerdict).toContain('[EMAIL_REDACTED]')
    expect(returnedVerdict).toContain('[PHONE_REDACTED]')
    expect(result.data.model).toBe('gpt-5.6-sol')
    expect(result.data.runtime).toBe('CODEX')
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

  it('persists a deterministic manual-reconciliation hint when room creation is uncertain', async () => {
    const coordinator = new FakeCoordinator()
    coordinator.createError = new Error('response lost after create')
    const provider = new BandExternalAgentProvider(config, coordinator, vi.fn(async () => {}))

    await expect(provider.execute({
      demoRunId: 'demo-create-unknown',
      idempotencyKey: 'idem-create-unknown',
      payload: { brief: 'Brief', currency: 'EUR', localPolicy: 'Policy' },
    })).rejects.toMatchObject({
      name: 'ProviderOutcomeUnknownError',
      externalHint: `band:create-outcome-unknown:${stableBandOperationId('idem-create-unknown')}`,
    })
    expect(coordinator.createdChats).toBe(1)
    expect(coordinator.sent).toEqual([])
  })

  it('keeps uncertain room creation fail-closed across reconciliation retries', async () => {
    const coordinator = new FakeCoordinator()
    coordinator.createError = new Error('response lost after create')
    const provider = new BandExternalAgentProvider(config, coordinator, vi.fn(async () => {}))
    const request = {
      demoRunId: 'demo-create-reconcile',
      idempotencyKey: 'idem-create-reconcile',
      payload: { brief: 'Brief', currency: 'EUR', localPolicy: 'Policy' },
    }
    const hint = `band:create-outcome-unknown:${stableBandOperationId(request.idempotencyKey)}`

    await expect(provider.execute(request)).rejects.toMatchObject({ externalHint: hint })
    for (let attempt = 0; attempt < 2; attempt += 1) {
      await expect(provider.reconcile(request.idempotencyKey, {
        ...request,
        externalHint: hint,
      })).rejects.toMatchObject({
        name: 'ProviderOutcomeUnknownError',
        externalHint: hint,
      })
    }

    expect(coordinator.createdChats).toBe(1)
    expect(coordinator.sent).toEqual([])
  })

  it('reconciles by a stable sanitized chat marker without creating or sending', async () => {
    const coordinator = new FakeCoordinator()
    coordinator.chats = [
      { id: 'other-chat', taskId: 'other-task' },
      { id: 'existing-chat', taskId: null },
    ]
    coordinator.contexts = [
      [message('negotiator', 'Unrelated room.')],
      [
        message('negotiator', `Internal reconciliation marker: ZHC_OPERATION_ID:${stableBandOperationId('idem-existing')}.`, 'marker-existing'),
        message('negotiator', `Internal brief marker: ZHC_BRIEF_ID:${stableBandOperationId('idem-existing')}.`, 'brief-existing'),
        ...completedTranscript(),
      ],
    ]
    const provider = new BandExternalAgentProvider(config, coordinator, vi.fn(async () => {}))

    const result = await provider.reconcile('idem-existing')

    expect(result?.data.roomId).toBe('existing-chat')
    expect(result?.data.briefMessageId).toBe('brief-existing')
    expect(coordinator.createdChats).toBe(0)
    expect(coordinator.sent).toEqual([])
    expect(coordinator.participants).toEqual([])
  })

  it('resumes an unmarked hinted room from the durable original request', async () => {
    const coordinator = new FakeCoordinator()
    coordinator.chats = [{ id: 'chat-1', taskId: null }]
    coordinator.contexts = [
      [],
      [],
      [],
      [
        ...completedTranscript(),
      ],
    ]
    const provider = new BandExternalAgentProvider(config, coordinator, vi.fn(async () => {}))

    const result = await provider.reconcile('idem-resume', {
      demoRunId: 'demo-resume',
      idempotencyKey: 'idem-resume',
      externalHint: 'chat-1',
      payload: { brief: 'Brief', currency: 'EUR', localPolicy: 'Floor EUR 158.' },
    })

    expect(result?.status).toBe('COMPLETE')
    expect(coordinator.sent).toHaveLength(1)
    expect(coordinator.sent[0]?.content).toContain(`ZHC_OPERATION_ID:${stableBandOperationId('idem-resume')}`)
    expect(coordinator.sent[0]?.content).toContain(`ZHC_BRIEF_ID:${stableBandOperationId('idem-resume')}`)
  })

  it('rejects ambiguous operation markers across rooms', async () => {
    const coordinator = new FakeCoordinator()
    coordinator.chats = [{ id: 'chat-1', taskId: null }, { id: 'chat-2', taskId: null }]
    const marker = `ZHC_OPERATION_ID:${stableBandOperationId('idem-duplicate')}`
    coordinator.contexts = [
      [message('negotiator', marker)],
      [message('negotiator', marker)],
    ]
    const provider = new BandExternalAgentProvider(config, coordinator, vi.fn(async () => {}))

    await expect(provider.reconcile('idem-duplicate')).rejects.toMatchObject({
      name: 'ProviderOutcomeUnknownError',
    })
  })

  it('ignores a copied operation marker not authored by the Negotiator', async () => {
    const coordinator = new FakeCoordinator()
    coordinator.chats = [{ id: 'chat-1', taskId: null }]
    coordinator.contexts = [[message('researcher', `ZHC_OPERATION_ID:${stableBandOperationId('idem-copy')}`)]]
    const provider = new BandExternalAgentProvider(config, coordinator, vi.fn(async () => {}))

    await expect(provider.reconcile('idem-copy')).resolves.toBeNull()
  })

  it('paginates the full identity-scoped room context with a bound SDK method', async () => {
    const firstPage = Array.from({ length: 100 }, (_, index) => message('negotiator', `message-${index}`))
    const finalMessage = message('policy', `ZHC_VERDICT ${JSON.stringify(validVerdict)}`)
    const rest = {
      getChatContext: vi.fn(function (this: unknown, request: { page: number }) {
        expect(this).toBe(rest)
        return Promise.resolve(request.page === 1
          ? { data: firstPage, metadata: { totalPages: 2 } }
          : { data: [finalMessage], metadata: { totalPages: 2 } })
      }),
    }
    const coordinator = new ThenvoiExternalCoordinator(config)
    ;(coordinator as unknown as { links: Map<string, unknown> }).links.set('negotiator', { rest })

    const messages = await coordinator.getChatContext('chat-long')

    expect(messages).toHaveLength(101)
    expect(rest.getChatContext.mock.calls.map(([request]) => request.page)).toEqual([1, 2])
  })
})
