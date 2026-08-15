import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  CODEX_BAND_AGENT_MODEL,
  DEFAULT_CODEX_THREAD_STATE_PATH,
  DEFAULT_CODEX_RUNTIME_HOME,
  DEFAULT_CODEX_WORKING_DIRECTORY,
  FileBandMessageReceiptStore,
  FileCodexThreadState,
  POLICY_FLOOR_EUR,
  createBandAgents,
  createCodexBrain,
  createPlanAuthenticatedCodex,
  createRoleHandler,
  formatPolicyResponse,
  loadBandAgentsConfig,
  parsePolicyVerdict,
  prepareCodexRuntimeHome,
  prepareCodexWorkingDirectory,
  redactSensitiveText,
  rolePrompt,
  type BandAgentsConfig,
  verifyChatGptSubscriptionAuth,
} from './band-agents.js'

const config: BandAgentsConfig = {
  brain: 'CODEX',
  codexThreadStatePath: '/tmp/zhc-band-test-threads.json',
  codexWorkingDirectory: '/tmp/zhc-band-test-workdir',
  codexRuntimeHome: '/tmp/zhc-band-test-runtime-home',
  agents: {
    researcher: { agentId: 'researcher-id', apiKey: 'researcher-secret' },
    negotiator: { agentId: 'negotiator-id', apiKey: 'negotiator-secret' },
    policyReviewer: { agentId: 'policy-id', apiKey: 'policy-secret' },
  },
}

describe('Band role prompts and policy verdicts', () => {
  it('states the collaboration roles and the EUR floor', () => {
    expect(rolePrompt('researcher')).toContain('Negotiator')
    expect(rolePrompt('researcher')).toContain('Policy Reviewer')
    expect(rolePrompt('negotiator')).toContain('Policy Reviewer')
    expect(rolePrompt('policyReviewer')).toContain(`EUR ${POLICY_FLOOR_EUR}`)
    expect(rolePrompt('policyReviewer')).toContain('ZHC_VERDICT')
  })

  it('accepts a schema-compatible floor-safe verdict that mentions Negotiator', () => {
    const verdict = {
      ZHC_VERDICT: true,
      recommendation: 'COUNTER',
      proposedPrice: 158,
      risks: ['Delivery timing'],
      rationale: 'The Negotiator terms meet the policy floor.',
      agentVotes: [{ agentId: 'policy-reviewer', vote: 'COUNTER', rationale: 'Floor is met.' }],
    }
    expect(parsePolicyVerdict(JSON.stringify(verdict))).toEqual(verdict)
  })

  it('turns malformed or below-floor model output into a safe escalation payload', () => {
    const content = formatPolicyResponse(JSON.stringify({
      ZHC_VERDICT: true,
      recommendation: 'ACCEPT',
      proposedPrice: 157,
      risks: [],
      rationale: 'Negotiator proposed it.',
      agentVotes: [{ agentId: 'policy', vote: 'ACCEPT', rationale: 'ok' }],
    }), { runtime: 'CODEX', model: CODEX_BAND_AGENT_MODEL })
    expect(content.startsWith('ZHC_VERDICT ')).toBe(true)
    const result = JSON.parse(content.slice('ZHC_VERDICT '.length))
    expect(result).toMatchObject({ ZHC_VERDICT: true, recommendation: 'ESCALATE', proposedPrice: null })
    expect(result.ZHC_BRAIN).toEqual({ runtime: 'CODEX', model: CODEX_BAND_AGENT_MODEL })
  })

  it('redacts common secrets and raw contact details before model or Band output', () => {
    const redacted = redactSensitiveText('Bearer abc123 token=topsecret password=do-not-keep {"apiKey":"json-secret"} email jane@example.com phone +1 (415) 555-1212 sk-or-v1-abcdefghijklmnop')
    expect(redacted).not.toContain('abc123')
    expect(redacted).not.toContain('topsecret')
    expect(redacted).not.toContain('do-not-keep')
    expect(redacted).not.toContain('json-secret')
    expect(redacted).not.toContain('jane@example.com')
    expect(redacted).not.toContain('555-1212')
    expect(redacted).not.toContain('sk-or-v1-abcdefghijklmnop')
  })

})

describe('Band role handler', () => {
  const operationId = '0123456789abcdef0123456789abcdef'
  const brief = `ZHC_OPERATION_ID:${operationId}\nZHC_BRIEF_ID:${operationId}\nBrief: negotiate terms`

  it('resolves the explicit Negotiator participant ID without skipping ahead to Policy', async () => {
    const sendMessage = vi.fn(async () => ({}))
    const brain = vi.fn(async () => ({
      text: 'Negotiator and Policy Reviewer: verified evidence only.',
      runtime: 'CODEX' as const,
      model: CODEX_BAND_AGENT_MODEL,
    }))
    const handler = createRoleHandler('researcher', brain, { negotiator: 'neg-id' })
    await handler({
      roomId: 'room-1',
      message: { id: 'message-1', senderId: 'neg-id', content: `${brief}\nContact jane@example.com with token=secret-value` },
      tools: {
        getParticipants: async () => [
          { id: 'neg-id', name: 'Negotiator', type: 'agent' },
          { id: 'policy-id', name: 'Policy Reviewer', type: 'agent' },
        ],
        sendMessage,
      },
    })

    expect(brain.mock.calls[0]?.[0].message).toContain('[REDACTED_EMAIL]')
    expect(sendMessage).toHaveBeenCalledWith(
      '[ZHC_BRAIN runtime=CODEX model=gpt-5.6-sol] Negotiator and Policy Reviewer: verified evidence only.',
      [{ id: 'neg-id', name: 'Negotiator' }],
    )
  })

  it('routes by configured identity when display names are customized', async () => {
    const sendMessage = vi.fn(async () => ({}))
    const handler = createRoleHandler('researcher', vi.fn(async () => ({
      text: 'Verified evidence.', runtime: 'CODEX' as const, model: CODEX_BAND_AGENT_MODEL,
    })), { negotiator: 'configured-negotiator-id' })

    await handler({
      roomId: 'room-custom-names',
      message: { id: 'message-2', senderId: 'configured-negotiator-id', content: brief },
      tools: {
        getParticipants: async () => [
          { id: 'configured-negotiator-id', name: 'ZHC Negotiator', handle: 'team/zhc-negotiator', type: 'agent' },
          { id: 'other-id', name: 'Negotiator', type: 'agent' },
        ],
        sendMessage,
      },
    })

    expect(sendMessage.mock.calls[0]?.[1]).toEqual([
      { id: 'configured-negotiator-id', name: 'ZHC Negotiator', handle: 'team/zhc-negotiator' },
    ])
  })

  it('routes an authenticated Researcher response only to the configured Policy Reviewer', async () => {
    const sendMessage = vi.fn(async () => ({}))
    const handler = createRoleHandler('negotiator', vi.fn(async () => ({
      text: 'Policy Reviewer, check these terms.', runtime: 'CODEX' as const, model: CODEX_BAND_AGENT_MODEL,
    })), { researcher: 'researcher-id', policyReviewer: 'policy-id' })

    await handler({
      roomId: 'room-1',
      message: { id: 'message-3', senderId: 'researcher-id', content: 'verified research' },
      tools: {
        getParticipants: async () => [
          { id: 'policy-id', name: 'Custom Policy', type: 'agent' },
          { id: 'impostor-id', name: 'Policy Reviewer', type: 'agent' },
        ],
        sendMessage,
      },
    })

    expect(sendMessage.mock.calls[0]?.[1]).toEqual([{ id: 'policy-id', name: 'Custom Policy' }])
  })

  it('delivers the Policy Reviewer verdict to Negotiator context', async () => {
    const sendMessage = vi.fn(async () => ({}))
    const handler = createRoleHandler('policyReviewer', vi.fn(async () => ({
      text: JSON.stringify({
        ZHC_VERDICT: true,
        recommendation: 'COUNTER',
        proposedPrice: 158,
        risks: [],
        rationale: 'The Negotiator proposal meets the floor.',
        agentVotes: [{ agentId: 'policy-reviewer', vote: 'COUNTER', rationale: 'Negotiator floor checked.' }],
      }),
      runtime: 'CODEX' as const,
      model: CODEX_BAND_AGENT_MODEL,
    })), { negotiator: 'neg-id' })
    await handler({
      roomId: 'room-1',
      message: { id: 'message-4', senderId: 'neg-id', content: 'terms' },
      tools: { getParticipants: async () => [{ id: 'neg-id', name: 'Negotiator', type: 'agent' }], sendMessage },
    })
    expect(sendMessage.mock.calls[0]?.[0]).toMatch(/^ZHC_VERDICT /)
    expect(sendMessage.mock.calls[0]?.[1]).toEqual([{ id: 'neg-id', name: 'Negotiator' }])
  })

  it('stops after Negotiator receives the final policy verdict', async () => {
    const getParticipants = vi.fn(async () => [])
    const sendMessage = vi.fn(async () => ({}))
    const brain = vi.fn(async () => ({
      text: 'must not run', runtime: 'CODEX' as const, model: CODEX_BAND_AGENT_MODEL,
    }))
    const handler = createRoleHandler('negotiator', brain, { researcher: 'researcher-id' })
    await handler({
      roomId: 'room-1',
      message: { id: 'message-5', senderId: 'policy-id', content: '  ZHC_VERDICT {"recommendation":"COUNTER"}' },
      tools: { getParticipants, sendMessage },
    })
    expect(getParticipants).not.toHaveBeenCalled()
    expect(brain).not.toHaveBeenCalled()
    expect(sendMessage).not.toHaveBeenCalled()
  })

  it('stops when Band prepends its structured delivery mention to the final verdict', async () => {
    const getParticipants = vi.fn(async () => [])
    const sendMessage = vi.fn(async () => ({}))
    const brain = vi.fn(async () => ({
      text: 'must not run', runtime: 'CODEX' as const, model: CODEX_BAND_AGENT_MODEL,
    }))
    const handler = createRoleHandler('negotiator', brain, { researcher: 'researcher-id' })
    await handler({
      roomId: 'room-1',
      message: { id: 'message-6', senderId: 'policy-id', content: '@[[negotiator-id]] ZHC_VERDICT {"recommendation":"COUNTER"}' },
      tools: { getParticipants, sendMessage },
    })
    expect(getParticipants).not.toHaveBeenCalled()
    expect(brain).not.toHaveBeenCalled()
    expect(sendMessage).not.toHaveBeenCalled()
  })

  it('does not send when a required participant cannot be resolved', async () => {
    const sendMessage = vi.fn(async () => ({}))
    const handler = createRoleHandler('negotiator', vi.fn(async () => ({
      text: 'terms', runtime: 'CODEX' as const, model: CODEX_BAND_AGENT_MODEL,
    })), { researcher: 'researcher-id', policyReviewer: 'policy-id' })
    await expect(handler({ roomId: 'room-1', message: { id: 'message-7', senderId: 'researcher-id', content: 'brief' }, tools: { getParticipants: async () => [], sendMessage } }))
      .rejects.toThrow('Policy Reviewer')
    expect(sendMessage).not.toHaveBeenCalled()
  })

  it.each([
    ['researcher', 'wrong-id', brief, { negotiator: 'negotiator-id' }],
    ['negotiator', 'wrong-id', 'research result', { researcher: 'researcher-id' }],
    ['policyReviewer', 'wrong-id', 'negotiated terms', { negotiator: 'negotiator-id' }],
  ] as const)('ignores a message to %s from the wrong sender', async (role, senderId, content, agentIds) => {
    const getParticipants = vi.fn(async () => [])
    const sendMessage = vi.fn(async () => ({}))
    const brain = vi.fn(async () => ({
      text: 'must not run', runtime: 'CODEX' as const, model: CODEX_BAND_AGENT_MODEL,
    }))
    const handler = createRoleHandler(role, brain, agentIds)

    await handler({ roomId: 'room-1', message: { id: `wrong-${role}`, senderId, content }, tools: { getParticipants, sendMessage } })

    expect(getParticipants).not.toHaveBeenCalled()
    expect(brain).not.toHaveBeenCalled()
    expect(sendMessage).not.toHaveBeenCalled()
  })

  it('ignores a Negotiator message to Researcher without the deterministic initial brief markers', async () => {
    const getParticipants = vi.fn(async () => [])
    const sendMessage = vi.fn(async () => ({}))
    const brain = vi.fn(async () => ({
      text: 'must not run', runtime: 'CODEX' as const, model: CODEX_BAND_AGENT_MODEL,
    }))
    const handler = createRoleHandler('researcher', brain, { negotiator: 'negotiator-id' })

    await handler({
      roomId: 'room-1',
      message: { id: 'message-8', senderId: 'negotiator-id', content: 'Please research this unrelated follow-up.' },
      tools: { getParticipants, sendMessage },
    })

    expect(getParticipants).not.toHaveBeenCalled()
    expect(brain).not.toHaveBeenCalled()
    expect(sendMessage).not.toHaveBeenCalled()
  })

  it('durably claims a concurrent duplicate before invoking Codex', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'zhc-band-receipts-concurrent-'))
    try {
      const store = new FileBandMessageReceiptStore(join(directory, 'receipts.json'))
      let resolveBrain!: (value: { text: string; runtime: 'CODEX'; model: typeof CODEX_BAND_AGENT_MODEL }) => void
      const firstBrain = new Promise<{ text: string; runtime: 'CODEX'; model: typeof CODEX_BAND_AGENT_MODEL }>((resolve) => {
        resolveBrain = resolve
      })
      const brain = vi.fn(() => firstBrain)
      const getParticipants = vi.fn(async () => [{ id: 'policy-id', name: 'Policy Reviewer', type: 'agent' }])
      const sendMessage = vi.fn(async () => ({}))
      const handler = createRoleHandler(
        'negotiator',
        brain,
        { researcher: 'researcher-id', policyReviewer: 'policy-id' },
        store,
      )
      const input = {
        roomId: 'room-concurrent',
        message: { id: 'message-concurrent', senderId: 'researcher-id', content: 'verified evidence' },
        tools: {
          getParticipants,
          sendMessage,
        },
      }

      const first = handler(input)
      await vi.waitFor(() => expect(brain).toHaveBeenCalledTimes(1))
      await expect(handler(input)).resolves.toBeUndefined()
      expect(brain).toHaveBeenCalledTimes(1)
      expect(getParticipants).toHaveBeenCalledTimes(1)
      resolveBrain({ text: 'Policy Reviewer, check terms.', runtime: 'CODEX', model: CODEX_BAND_AGENT_MODEL })
      await expect(first).resolves.toBeUndefined()
      expect(sendMessage).toHaveBeenCalledTimes(1)
    } finally {
      await rm(directory, { recursive: true, force: true })
    }
  })

  it('suppresses a completed message after receipt-store restart and writes mode 0600', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'zhc-band-receipts-restart-'))
    try {
      const path = join(directory, 'receipts.json')
      const brain = vi.fn(async () => ({
        text: 'Policy Reviewer, check terms.', runtime: 'CODEX' as const, model: CODEX_BAND_AGENT_MODEL,
      }))
      const sendMessage = vi.fn(async () => ({}))
      const createHandler = (store: FileBandMessageReceiptStore) => createRoleHandler(
        'negotiator', brain, { researcher: 'researcher-id', policyReviewer: 'policy-id' }, store,
      )
      const input = {
        roomId: 'room-restart',
        message: { id: 'message-restart', senderId: 'researcher-id', content: 'verified evidence' },
        tools: {
          getParticipants: async () => [{ id: 'policy-id', name: 'Policy Reviewer', type: 'agent' }],
          sendMessage,
        },
      }

      await createHandler(new FileBandMessageReceiptStore(path))(input)
      await createHandler(new FileBandMessageReceiptStore(path))(input)

      expect(brain).toHaveBeenCalledTimes(1)
      expect(sendMessage).toHaveBeenCalledTimes(1)
      expect((await stat(path)).mode & 0o777).toBe(0o600)
    } finally {
      await rm(directory, { recursive: true, force: true })
    }
  })

  it('releases a pre-send failure so provider redelivery can retry', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'zhc-band-receipts-retry-'))
    try {
      const brain = vi.fn()
        .mockRejectedValueOnce(new Error('Codex failed'))
        .mockResolvedValueOnce({ text: 'Policy Reviewer, check terms.', runtime: 'CODEX', model: CODEX_BAND_AGENT_MODEL })
      const sendMessage = vi.fn(async () => ({}))
      const handler = createRoleHandler(
        'negotiator',
        brain,
        { researcher: 'researcher-id', policyReviewer: 'policy-id' },
        new FileBandMessageReceiptStore(join(directory, 'receipts.json')),
      )
      const input = {
        roomId: 'room-retry',
        message: { id: 'message-retry', senderId: 'researcher-id', content: 'verified evidence' },
        tools: {
          getParticipants: async () => [{ id: 'policy-id', name: 'Policy Reviewer', type: 'agent' }],
          sendMessage,
        },
      }

      await expect(handler(input)).rejects.toThrow('Codex failed')
      await expect(handler(input)).resolves.toBeUndefined()
      expect(brain).toHaveBeenCalledTimes(2)
      expect(sendMessage).toHaveBeenCalledTimes(1)
    } finally {
      await rm(directory, { recursive: true, force: true })
    }
  })

  it('never retries after send begins when provider acceptance is unknown', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'zhc-band-receipts-unknown-'))
    try {
      const path = join(directory, 'receipts.json')
      const brain = vi.fn(async () => ({
        text: 'Policy Reviewer, check terms.', runtime: 'CODEX' as const, model: CODEX_BAND_AGENT_MODEL,
      }))
      const sendMessage = vi.fn(async () => { throw new Error('provider response lost') })
      const createHandler = (store: FileBandMessageReceiptStore) => createRoleHandler(
        'negotiator', brain, { researcher: 'researcher-id', policyReviewer: 'policy-id' }, store,
      )
      const input = {
        roomId: 'room-unknown',
        message: { id: 'message-unknown', senderId: 'researcher-id', content: 'verified evidence' },
        tools: {
          getParticipants: async () => [{ id: 'policy-id', name: 'Policy Reviewer', type: 'agent' }],
          sendMessage,
        },
      }

      await expect(createHandler(new FileBandMessageReceiptStore(path))(input)).rejects.toThrow('provider response lost')
      await expect(createHandler(new FileBandMessageReceiptStore(path))(input)).resolves.toBeUndefined()
      expect(brain).toHaveBeenCalledTimes(1)
      expect(sendMessage).toHaveBeenCalledTimes(1)
    } finally {
      await rm(directory, { recursive: true, force: true })
    }
  })

  it('reclaims a pre-send claim from a replaced worker immediately', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'zhc-band-receipts-lease-'))
    try {
      const path = join(directory, 'receipts.json')
      const oldStore = new FileBandMessageReceiptStore(path, {
        ownerId: 'old-worker',
      })
      expect(await oldStore.claim('negotiator', 'room-lease', 'message-lease')).toBe('CLAIMED')

      const brain = vi.fn(async () => ({
        text: 'Policy Reviewer, check terms.', runtime: 'CODEX' as const, model: CODEX_BAND_AGENT_MODEL,
      }))
      const handler = createRoleHandler(
        'negotiator',
        brain,
        { researcher: 'researcher-id', policyReviewer: 'policy-id' },
        new FileBandMessageReceiptStore(path, {
          ownerId: 'replacement-worker',
        }),
      )
      const input = {
        roomId: 'room-lease',
        message: { id: 'message-lease', senderId: 'researcher-id', content: 'verified evidence' },
        tools: {
          getParticipants: async () => [{ id: 'policy-id', name: 'Policy Reviewer', type: 'agent' }],
          sendMessage: vi.fn(async () => ({})),
        },
      }

      await expect(handler(input)).resolves.toBeUndefined()
      expect(brain).toHaveBeenCalledTimes(1)
      expect(input.tools.sendMessage).toHaveBeenCalledTimes(1)
    } finally {
      await rm(directory, { recursive: true, force: true })
    }
  })

  it('never compacts acceptance-unknown sending receipts', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'zhc-band-receipts-compaction-'))
    try {
      const path = join(directory, 'receipts.json')
      const sendingKey = JSON.stringify(['negotiator', 'room-sending', 'message-sending'])
      const receipts = Object.fromEntries([
        [sendingKey, { status: 'SENDING', updatedAt: 1, ownerId: 'old-worker' }],
        ...Array.from({ length: 4_097 }, (_, index) => [
          JSON.stringify(['negotiator', 'room-done', `message-${index}`]),
          { status: 'DONE', updatedAt: index + 2, ownerId: 'old-worker' },
        ]),
      ])
      await writeFile(path, `${JSON.stringify({ version: 1, receipts })}\n`, { mode: 0o600 })

      const store = new FileBandMessageReceiptStore(path, { ownerId: 'new-worker' })
      expect(await store.claim('negotiator', 'room-new', 'message-new')).toBe('CLAIMED')

      const persisted = JSON.parse(await readFile(path, 'utf8')) as { receipts: Record<string, { status: string }> }
      expect(persisted.receipts[sendingKey]?.status).toBe('SENDING')
      expect(Object.values(persisted.receipts).filter((receipt) => receipt.status === 'DONE')).toHaveLength(4_096)
    } finally {
      await rm(directory, { recursive: true, force: true })
    }
  })
})

describe('Band runtime configuration', () => {
  it('loads only role-specific Band credentials', () => {
    const loaded = loadBandAgentsConfig({
      OPENAI_API_KEY: 'openai',
      BAND_RESEARCHER_AGENT_ID: 'r', BAND_RESEARCHER_API_KEY: 'rk',
      BAND_NEGOTIATOR_AGENT_ID: 'n', BAND_NEGOTIATOR_API_KEY: 'nk',
      BAND_POLICY_AGENT_ID: 'p', BAND_POLICY_AGENT_API_KEY: 'pk',
    })
    expect(loaded.agents).toEqual({
      researcher: { agentId: 'r', apiKey: 'rk' },
      negotiator: { agentId: 'n', apiKey: 'nk' },
      policyReviewer: { agentId: 'p', apiKey: 'pk' },
    })
    expect(loaded).toMatchObject({
      brain: 'CODEX',
      codexThreadStatePath: DEFAULT_CODEX_THREAD_STATE_PATH,
      codexWorkingDirectory: DEFAULT_CODEX_WORKING_DIRECTORY,
      codexRuntimeHome: DEFAULT_CODEX_RUNTIME_HOME,
    })
  })

  it('defaults to plan-authenticated Codex without requiring an OpenAI API key', () => {
    const loaded = loadBandAgentsConfig({
      PATH: '/usr/bin',
      BAND_RESEARCHER_AGENT_ID: 'r', BAND_RESEARCHER_API_KEY: 'rk',
      BAND_NEGOTIATOR_AGENT_ID: 'n', BAND_NEGOTIATOR_API_KEY: 'nk',
      BAND_POLICY_AGENT_ID: 'p', BAND_POLICY_AGENT_API_KEY: 'pk',
    })
    expect(loaded).toMatchObject({ brain: 'CODEX' })
  })

  it('rejects the API-backed Responses brain', () => {
    const base = {
      BAND_RESEARCHER_AGENT_ID: 'r', BAND_RESEARCHER_API_KEY: 'rk',
      BAND_NEGOTIATOR_AGENT_ID: 'n', BAND_NEGOTIATOR_API_KEY: 'nk',
      BAND_POLICY_AGENT_ID: 'p', BAND_POLICY_AGENT_API_KEY: 'pk',
    }
    expect(() => loadBandAgentsConfig({ ...base, BAND_AGENT_BRAIN: 'RESPONSES' }))
      .toThrow('API-backed Band brains are disabled')
  })

  it('constructs Codex without apiKey and strips explicit API auth from its child environment', () => {
    const factory = vi.fn(() => ({ startThread: vi.fn(), resumeThread: vi.fn() }))
    createPlanAuthenticatedCodex({
      PATH: '/usr/local/bin',
      CODEX_HOME: '/safe/codex-home',
      OPENAI_API_KEY: 'openai-secret',
      CODEX_API_KEY: 'codex-secret',
      BAND_RESEARCHER_API_KEY: 'band-secret',
      AZURE_OPENAI_API_KEY: 'azure-secret',
      OPENAI_ACCESS_TOKEN: 'access-secret',
      OWNER_EMAIL: 'owner@example.com',
      LINQ_PHONE_ID: 'phone-id',
      ARBITRARY_VALUE: 'private-data',
    }, factory)
    expect(factory).toHaveBeenCalledWith({
      env: { PATH: '/usr/local/bin', CODEX_HOME: '/safe/codex-home' },
    })
    expect(factory.mock.calls[0]?.[0]).not.toHaveProperty('apiKey')
  })

  it('uses a dedicated runtime home instead of exposing the source Codex home', () => {
    const factory = vi.fn(() => ({ startThread: vi.fn(), resumeThread: vi.fn() }))
    createPlanAuthenticatedCodex({
      PATH: '/usr/local/bin',
      CODEX_HOME: '/source/codex-home',
    }, factory, '/isolated/codex-home')
    expect(factory).toHaveBeenCalledWith({
      env: { PATH: '/usr/local/bin', CODEX_HOME: '/isolated/codex-home' },
    })
  })

  it('accepts only a local ChatGPT subscription login status with the isolated runtime home', async () => {
    const runner = vi.fn(async () => 'Logged in using ChatGPT\n')

    await expect(verifyChatGptSubscriptionAuth('/isolated/codex-home', runner)).resolves.toBeUndefined()

    expect(runner).toHaveBeenCalledWith(expect.objectContaining({ CODEX_HOME: '/isolated/codex-home' }))
  })

  it('fails closed without leaking Codex login status details', async () => {
    const leakedDetail = 'Logged in using an API key sk-sensitive'
    let error: unknown
    try {
      await verifyChatGptSubscriptionAuth('/isolated/codex-home', async () => leakedDetail)
    } catch (caught) {
      error = caught
    }

    expect(error).toBeInstanceOf(Error)
    expect((error as Error).message).not.toContain(leakedDetail)
    expect((error as Error).message).toContain('ChatGPT subscription')
  })

  it('creates exactly one agent per unique identity', () => {
    const factory = vi.fn(() => ({ run: vi.fn(async () => {}), stop: vi.fn(async () => true) }))
    const agents = createBandAgents(config, vi.fn(async () => ({
      text: 'response', runtime: 'CODEX' as const, model: CODEX_BAND_AGENT_MODEL,
    })), factory)
    expect(agents).toHaveLength(3)
    expect(factory).toHaveBeenCalledTimes(3)
    expect(factory.mock.calls.map((call) => call[1])).toEqual([
      config.agents.researcher,
      config.agents.negotiator,
      config.agents.policyReviewer,
    ])
  })

  it('rejects duplicate identity connections', () => {
    const duplicate = structuredClone(config)
    duplicate.agents.policyReviewer.agentId = duplicate.agents.negotiator.agentId
    expect(() => createBandAgents(duplicate, vi.fn(async () => ({
      text: 'response', runtime: 'CODEX' as const, model: CODEX_BAND_AGENT_MODEL,
    })))).toThrow('must be unique')
  })
})

describe('Codex thread brain', () => {
  const temporaryDirectories: string[] = []

  afterEach(async () => {
    await Promise.all(temporaryDirectories.splice(0).map((path) => rm(path, { recursive: true, force: true })))
  })

  it('recovers corrupt state and atomically persists only room-isolated role thread IDs', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'zhc-band-state-test-'))
    temporaryDirectories.push(directory)
    const path = join(directory, 'threads.json')
    const state = new FileCodexThreadState(path)
    await writeFile(path, '{bad json')
    await expect(state.load()).resolves.toEqual({})

    await state.save({
      'researcher:room-1': 'thread-r',
      'negotiator:room-1': 'thread-n',
      'policyReviewer:room-1': 'thread-p',
      apiKey: 'must-not-persist',
      message: 'must-not-persist',
    } as never)
    expect(JSON.parse(await readFile(path, 'utf8'))).toEqual({
      'researcher:room-1': 'thread-r',
      'negotiator:room-1': 'thread-n',
      'policyReviewer:room-1': 'thread-p',
    })
  })

  it('fails closed when the dedicated Codex working directory is not empty', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'zhc-band-workdir-test-'))
    temporaryDirectories.push(directory)
    await writeFile(join(directory, '.env'), 'SECRET=must-not-be-visible')
    await expect(prepareCodexWorkingDirectory(directory)).rejects.toThrow('dedicated empty directory')
  })

  it('installs a deny-by-default permission profile in the isolated runtime home', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'zhc-band-runtime-test-'))
    temporaryDirectories.push(directory)
    const sourceHome = join(directory, 'source')
    const runtimeHome = join(directory, 'runtime')
    await mkdir(sourceHome, { recursive: true })
    await writeFile(join(sourceHome, 'auth.json'), '{"tokens":"private"}', { mode: 0o600 })

    await prepareCodexRuntimeHome(runtimeHome, sourceHome)

    const securityConfig = await readFile(join(runtimeHome, 'config.toml'), 'utf8')
    expect(securityConfig).toContain('forced_login_method = "chatgpt"')
    expect(securityConfig).toContain('default_permissions = "band-message"')
    expect(securityConfig).toContain('":root" = "deny"')
    expect(securityConfig).toContain('":workspace_roots"')
    expect(securityConfig).toContain('enabled = false')
    expect(await readFile(join(runtimeHome, 'auth.json'), 'utf8')).toBe('{"tokens":"private"}')
  })

  it('resumes saved roles, starts missing roles, and persists the new thread ID', async () => {
    const save = vi.fn(async () => {})
    const resumedThread = { id: 'thread-r', run: vi.fn(async () => ({ finalResponse: 'research result' })) }
    const newThread = { id: 'thread-n', run: vi.fn(async () => ({ finalResponse: 'terms' })) }
    const client = {
      resumeThread: vi.fn(() => resumedThread),
      startThread: vi.fn(() => newThread),
    }
    const brain = await createCodexBrain({
      client,
      state: { load: async () => ({ 'researcher:room-1': 'thread-r' }), save },
    })

    await brain({ role: 'researcher', roomId: 'room-1', instructions: 'research', message: 'brief' })
    await brain({ role: 'negotiator', roomId: 'room-1', instructions: 'negotiate', message: 'evidence' })

    expect(client.resumeThread).toHaveBeenCalledWith('thread-r', expect.objectContaining({
      model: 'gpt-5.6-sol',
      approvalPolicy: 'never',
      workingDirectory: DEFAULT_CODEX_WORKING_DIRECTORY,
      skipGitRepoCheck: true,
    }))
    expect(client.startThread).toHaveBeenCalledWith(expect.objectContaining({ model: 'gpt-5.6-sol' }))
    expect(save).toHaveBeenCalledWith(expect.objectContaining({
      'researcher:room-1': 'thread-r',
      'negotiator:room-1': 'thread-n',
    }))
  })

  it('serializes turns for the same role thread', async () => {
    let resolveFirst!: (value: { finalResponse: string }) => void
    const firstTurn = new Promise<{ finalResponse: string }>((resolve) => { resolveFirst = resolve })
    const run = vi.fn()
      .mockImplementationOnce(() => firstTurn)
      .mockResolvedValueOnce({ finalResponse: 'second' })
    const brain = await createCodexBrain({
      client: {
        startThread: () => ({ id: 'thread-r', run }),
        resumeThread: () => ({ id: 'unused', run }),
      },
      state: { load: async () => ({}), save: async () => {} },
    })
    const input = { role: 'researcher' as const, roomId: 'room-1', instructions: 'research', message: 'brief' }
    const first = brain(input)
    await vi.waitFor(() => expect(run).toHaveBeenCalledTimes(1))
    const second = brain(input)
    await Promise.resolve()
    expect(run).toHaveBeenCalledTimes(1)
    resolveFirst({ finalResponse: 'first' })
    await expect(first).resolves.toMatchObject({ text: 'first', runtime: 'CODEX' })
    await expect(second).resolves.toMatchObject({ text: 'second', runtime: 'CODEX' })
  })

  it('does not fall back after a Codex failure by default', async () => {
    const brain = await createCodexBrain({
      client: {
        startThread: () => ({ id: null, run: vi.fn(async () => { throw new Error('secret internal failure') }) }),
        resumeThread: () => ({ id: null, run: vi.fn() }),
      },
      state: { load: async () => ({}), save: async () => {} },
    })
    await expect(brain({ role: 'researcher', roomId: 'room-1', instructions: 'research', message: 'brief' }))
      .rejects.toThrow('Codex brain turn failed')
  })
})
