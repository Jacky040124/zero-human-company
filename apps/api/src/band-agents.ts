import './env.js'
import { Agent, GenericAdapter, isDirectExecution, type AdapterToolsProtocol, type PlatformMessage } from '@band-ai/sdk'
import { Codex, type CodexOptions, type ThreadOptions } from '@openai/codex-sdk'
import { execFile } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { access, chmod, copyFile, mkdir, readFile, readdir, rename, writeFile } from 'node:fs/promises'
import { homedir, tmpdir } from 'node:os'
import { dirname, join } from 'node:path'

export const CODEX_BAND_AGENT_MODEL = 'gpt-5.6-sol'
export const DEFAULT_CODEX_THREAD_STATE_PATH = join(tmpdir(), 'zero-human-company', 'band-codex-threads.json')
export const DEFAULT_CODEX_WORKING_DIRECTORY = join(tmpdir(), 'zero-human-company', 'codex-workdir')
export const DEFAULT_CODEX_RUNTIME_HOME = join(tmpdir(), 'zero-human-company', 'codex-runtime')
export const POLICY_FLOOR_EUR = 158

export type BandAgentRole = 'researcher' | 'negotiator' | 'policyReviewer'

export type BandAgentIdentity = {
  agentId: string
  apiKey: string
}

export type BandAgentsConfig = {
  brain: 'CODEX'
  codexThreadStatePath: string
  codexWorkingDirectory: string
  codexRuntimeHome: string
  wsUrl?: string
  restUrl?: string
  agents: Record<BandAgentRole, BandAgentIdentity>
}

export type BrainProof = {
  runtime: 'CODEX'
  model: typeof CODEX_BAND_AGENT_MODEL
}

export type BrainResult = BrainProof & { text: string }
export type RoleBrain = (input: { role: BandAgentRole; roomId: string; instructions: string; message: string }) => Promise<BrainResult>

const ROLE_NAMES: Record<BandAgentRole, string> = {
  researcher: 'Researcher',
  negotiator: 'Negotiator',
  policyReviewer: 'Policy Reviewer',
}

const ROLE_TARGETS: Record<BandAgentRole, BandAgentRole[]> = {
  researcher: ['negotiator'],
  negotiator: ['policyReviewer'],
  // Band REST chat context is identity-scoped. Mention the Negotiator so the
  // provider identity that owns the room can hydrate and verify the verdict.
  policyReviewer: ['negotiator'],
}

export function rolePrompt(role: BandAgentRole): string {
  switch (role) {
    case 'researcher':
      return [
        'You are the Researcher in a three-agent Band negotiation.',
        'Analyze only verified evidence present in the message. Clearly label unknown or unverified claims.',
        'Return a concise evidence summary to the Negotiator, while noting that the evidence is intended for later Policy Reviewer review.',
        'Mention the Negotiator by role in the response.',
        'Never reveal credentials, access tokens, email addresses, phone numbers, or other raw personal data.',
      ].join(' ')
    case 'negotiator':
      return [
        'You are the Negotiator in a three-agent Band negotiation.',
        'Use the supplied evidence to propose schema-compatible terms: recommendation, proposedPrice, risks, rationale, and agentVotes.',
        'Keep all prices in the currency stated by the brief and do not invent evidence.',
        'Mention Policy Reviewer by role and ask for the final policy check.',
        'Never reveal credentials, access tokens, email addresses, phone numbers, or other raw personal data.',
      ].join(' ')
    case 'policyReviewer':
      return [
        'You are the Policy Reviewer and you issue the final negotiation verdict only after reviewing the evidence and the Negotiator proposal.',
        `For EUR negotiations, enforce an absolute floor of EUR ${POLICY_FLOOR_EUR}: ACCEPT or COUNTER must never propose a lower price.`,
        'Mention the Negotiator in the rationale or an agent vote.',
        'Return JSON only, with no markdown or prose, using exactly this top-level shape:',
        '{"ZHC_VERDICT":true,"recommendation":"ACCEPT|COUNTER|REJECT|ESCALATE","proposedPrice":number|null,"risks":[string],"rationale":string,"agentVotes":[{"agentId":string,"vote":"ACCEPT|COUNTER|REJECT|ESCALATE","rationale":string}]}',
        'Never reveal credentials, access tokens, email addresses, phone numbers, or other raw personal data.',
      ].join(' ')
  }
}

export function redactSensitiveText(value: string): string {
  return value
    .replace(/("(?:api[_ -]?key|token|secret|password)"\s*:\s*")[^"]*(")/gi, '$1[REDACTED_SECRET]$2')
    .replace(/\bBearer\s+[^\s"']+/gi, 'Bearer [REDACTED_SECRET]')
    .replace(/\b(?:sk|rk|pk|whsec)[_-][A-Za-z0-9_-]{8,}\b/g, '[REDACTED_SECRET]')
    .replace(/\b(api[_ -]?key|token|secret|password)\s*[:=]\s*[^\s,;]+/gi, '$1=[REDACTED_SECRET]')
    .replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, '[REDACTED_EMAIL]')
    .replace(/(?<!\w)(?:\+?\d[\d ().-]{7,}\d)(?!\w)/g, '[REDACTED_PHONE]')
}

type VerdictVote = {
  agentId: string
  vote: 'ACCEPT' | 'COUNTER' | 'REJECT' | 'ESCALATE'
  rationale: string
}

export type PolicyVerdict = {
  ZHC_VERDICT: true
  recommendation: VerdictVote['vote']
  proposedPrice: number | null
  risks: string[]
  rationale: string
  agentVotes: VerdictVote[]
}

const RECOMMENDATIONS = new Set<VerdictVote['vote']>(['ACCEPT', 'COUNTER', 'REJECT', 'ESCALATE'])

export function parsePolicyVerdict(value: string): PolicyVerdict | null {
  const cleaned = value.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').replace(/^ZHC_VERDICT\s*:?\s*/i, '')
  let parsed: unknown
  try {
    parsed = JSON.parse(cleaned)
  } catch {
    return null
  }
  if (!parsed || typeof parsed !== 'object') return null
  const verdict = parsed as Partial<PolicyVerdict>
  if (verdict.ZHC_VERDICT !== true || !RECOMMENDATIONS.has(verdict.recommendation as VerdictVote['vote'])) return null
  if (verdict.proposedPrice !== null && (typeof verdict.proposedPrice !== 'number' || verdict.proposedPrice < 0)) return null
  if (!Array.isArray(verdict.risks) || !verdict.risks.every((risk) => typeof risk === 'string' && risk.length > 0)) return null
  if (typeof verdict.rationale !== 'string' || verdict.rationale.length === 0) return null
  if (!Array.isArray(verdict.agentVotes) || verdict.agentVotes.length === 0) return null
  if (!verdict.agentVotes.every((vote) => vote && typeof vote.agentId === 'string' && vote.agentId.length > 0
    && RECOMMENDATIONS.has(vote.vote) && typeof vote.rationale === 'string' && vote.rationale.length > 0)) return null
  if ((verdict.recommendation === 'ACCEPT' || verdict.recommendation === 'COUNTER')
    && (verdict.proposedPrice === null || verdict.proposedPrice < POLICY_FLOOR_EUR)) return null
  const mentionsNegotiator = verdict.rationale.toLowerCase().includes('negotiator')
    || verdict.agentVotes.some((vote) => vote.agentId.toLowerCase().includes('negotiator')
      || vote.rationale.toLowerCase().includes('negotiator'))
  return mentionsNegotiator ? verdict as PolicyVerdict : null
}

export function formatPolicyResponse(value: string, proof?: BrainProof): string {
  const verdict = parsePolicyVerdict(value) ?? {
    ZHC_VERDICT: true as const,
    recommendation: 'ESCALATE' as const,
    proposedPrice: null,
    risks: ['The Policy Reviewer could not produce a valid floor-safe verdict.'],
    rationale: `The Negotiator proposal requires review because no valid verdict above the EUR ${POLICY_FLOOR_EUR} floor was produced.`,
    agentVotes: [{ agentId: 'policy-reviewer', vote: 'ESCALATE' as const, rationale: 'Negotiator terms require a valid policy re-check.' }],
  }
  return `ZHC_VERDICT ${JSON.stringify({ ...verdict, ...(proof ? { ZHC_BRAIN: proof } : {}) })}`
}

type RoleTools = Pick<AdapterToolsProtocol, 'getParticipants' | 'sendMessage'>

type BandMessageReceiptStatus = 'CLAIMED' | 'SENDING' | 'DONE'
type BandMessageReceipt = { status: BandMessageReceiptStatus; updatedAt: number; ownerId?: string }
type BandMessageReceipts = Record<string, BandMessageReceipt>
type BandMessageClaim = 'CLAIMED' | 'DUPLICATE'

export type BandMessageReceiptStore = {
  claim(role: BandAgentRole, roomId: string, messageId: string): Promise<BandMessageClaim>
  release(role: BandAgentRole, roomId: string, messageId: string): Promise<void>
  markSending(role: BandAgentRole, roomId: string, messageId: string): Promise<void>
  markDone(role: BandAgentRole, roomId: string, messageId: string): Promise<void>
}

const MAX_TERMINAL_MESSAGE_RECEIPTS = 4_096

function messageReceiptKey(role: BandAgentRole, roomId: string, messageId: string): string {
  const normalizedRoomId = roomId.trim()
  const normalizedMessageId = messageId.trim()
  if (!normalizedRoomId || /[\r\n]/.test(normalizedRoomId) || normalizedRoomId.length > 240) {
    throw new Error('Band room ID is invalid for message receipt state')
  }
  if (!normalizedMessageId || /[\r\n]/.test(normalizedMessageId) || normalizedMessageId.length > 512) {
    throw new Error('Band message ID is invalid for message receipt state')
  }
  return JSON.stringify([role, normalizedRoomId, normalizedMessageId])
}

export function bandMessageReceiptPath(codexThreadStatePath: string): string {
  return `${codexThreadStatePath}.receipts.json`
}

export class FileBandMessageReceiptStore implements BandMessageReceiptStore {
  private operationQueue: Promise<void> = Promise.resolve()
  private readonly ownerId: string
  private readonly now: () => number

  constructor(
    private readonly path: string,
    options: { ownerId?: string; now?: () => number } = {},
  ) {
    this.ownerId = options.ownerId ?? randomUUID()
    this.now = options.now ?? Date.now
  }

  private serialize<T>(operation: () => Promise<T>): Promise<T> {
    const result = this.operationQueue.then(operation, operation)
    this.operationQueue = result.then(() => undefined, () => undefined)
    return result
  }

  private async load(): Promise<BandMessageReceipts> {
    try {
      const parsed: unknown = JSON.parse(await readFile(this.path, 'utf8'))
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
        throw new Error('Band message receipt state is invalid')
      }
      const candidate = parsed as { version?: unknown; receipts?: unknown }
      if (candidate.version !== 1 || !candidate.receipts || typeof candidate.receipts !== 'object' || Array.isArray(candidate.receipts)) {
        throw new Error('Band message receipt state is invalid')
      }
      return Object.fromEntries(Object.entries(candidate.receipts as Record<string, unknown>).flatMap(([key, value]) => {
        if (!value || typeof value !== 'object' || Array.isArray(value)) return []
        const receipt = value as Partial<BandMessageReceipt>
        return (receipt.status === 'CLAIMED' || receipt.status === 'SENDING' || receipt.status === 'DONE')
          && typeof receipt.updatedAt === 'number' && Number.isFinite(receipt.updatedAt)
          ? [[key, {
              status: receipt.status,
              updatedAt: receipt.updatedAt,
              ...(typeof receipt.ownerId === 'string' ? { ownerId: receipt.ownerId } : {}),
            } satisfies BandMessageReceipt]]
          : []
      }))
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
      return {}
    }
  }

  private compact(receipts: BandMessageReceipts): BandMessageReceipts {
    const terminal = Object.entries(receipts)
      .filter(([, receipt]) => receipt.status === 'DONE')
      .sort((left, right) => right[1].updatedAt - left[1].updatedAt)
      .slice(0, MAX_TERMINAL_MESSAGE_RECEIPTS)
    return Object.fromEntries([
      ...Object.entries(receipts).filter(([, receipt]) => receipt.status !== 'DONE'),
      ...terminal,
    ])
  }

  private nextUpdatedAt(receipts: BandMessageReceipts): number {
    return Object.values(receipts).reduce(
      (latest, receipt) => Math.max(latest, receipt.updatedAt + 1),
      this.now(),
    )
  }

  private async persist(receipts: BandMessageReceipts): Promise<void> {
    const compacted = this.compact(receipts)
    await mkdir(dirname(this.path), { recursive: true })
    const temporaryPath = `${this.path}.${process.pid}.${randomUUID()}.tmp`
    await writeFile(temporaryPath, `${JSON.stringify({ version: 1, receipts: compacted }, null, 2)}\n`, {
      encoding: 'utf8',
      mode: 0o600,
    })
    await rename(temporaryPath, this.path)
  }

  async claim(role: BandAgentRole, roomId: string, messageId: string): Promise<BandMessageClaim> {
    const key = messageReceiptKey(role, roomId, messageId)
    return this.serialize(async () => {
      const receipts = await this.load()
      const existing = receipts[key]
      if (existing?.status === 'SENDING' || existing?.status === 'DONE' || existing?.ownerId === this.ownerId) {
        return 'DUPLICATE'
      }
      // Production creates one shared store per worker and Band supersedes the
      // old single-instance connection during replacement. A CLAIMED receipt
      // from another store owner therefore represents a crashed/replaced
      // pre-send worker and is safe to reclaim immediately. SENDING remains
      // acceptance-unknown and is never reclaimed.
      await this.persist({
        ...receipts,
        [key]: { status: 'CLAIMED', updatedAt: this.nextUpdatedAt(receipts), ownerId: this.ownerId },
      })
      return 'CLAIMED'
    })
  }

  async release(role: BandAgentRole, roomId: string, messageId: string): Promise<void> {
    const key = messageReceiptKey(role, roomId, messageId)
    await this.serialize(async () => {
      const receipts = await this.load()
      if (receipts[key]?.status !== 'CLAIMED' || receipts[key]?.ownerId !== this.ownerId) return
      const next = { ...receipts }
      delete next[key]
      await this.persist(next)
    })
  }

  private async transition(
    role: BandAgentRole,
    roomId: string,
    messageId: string,
    expected: BandMessageReceiptStatus,
    status: BandMessageReceiptStatus,
  ): Promise<void> {
    const key = messageReceiptKey(role, roomId, messageId)
    await this.serialize(async () => {
      const receipts = await this.load()
      if (receipts[key]?.status !== expected || receipts[key]?.ownerId !== this.ownerId) {
        throw new Error('Band message receipt transition is invalid')
      }
      await this.persist({
        ...receipts,
        [key]: { status, updatedAt: this.nextUpdatedAt(receipts), ownerId: this.ownerId },
      })
    })
  }

  markSending(role: BandAgentRole, roomId: string, messageId: string): Promise<void> {
    return this.transition(role, roomId, messageId, 'CLAIMED', 'SENDING')
  }

  markDone(role: BandAgentRole, roomId: string, messageId: string): Promise<void> {
    return this.transition(role, roomId, messageId, 'SENDING', 'DONE')
  }
}

class MemoryBandMessageReceiptStore implements BandMessageReceiptStore {
  private readonly receipts = new Set<string>()

  async claim(role: BandAgentRole, roomId: string, messageId: string): Promise<BandMessageClaim> {
    const key = messageReceiptKey(role, roomId, messageId)
    if (this.receipts.has(key)) return 'DUPLICATE'
    this.receipts.add(key)
    return 'CLAIMED'
  }

  async release(role: BandAgentRole, roomId: string, messageId: string): Promise<void> {
    this.receipts.delete(messageReceiptKey(role, roomId, messageId))
  }

  async markSending(): Promise<void> {}
  async markDone(): Promise<void> {}
}

const INITIAL_BRIEF_MARKER = /\bZHC_BRIEF_ID:([a-f0-9]{32})\b/
const OPERATION_MARKER = /\bZHC_OPERATION_ID:([a-f0-9]{32})\b/

function isExpectedInitialBrief(content: string): boolean {
  const briefId = INITIAL_BRIEF_MARKER.exec(content)?.[1]
  const operationId = OPERATION_MARKER.exec(content)?.[1]
  return Boolean(briefId && operationId && briefId === operationId && content.includes('Brief:'))
}

function expectedSenderRole(role: BandAgentRole): BandAgentRole {
  return role === 'negotiator' ? 'researcher' : 'negotiator'
}

export function createRoleHandler(
  role: BandAgentRole,
  brain: RoleBrain,
  configuredAgentIds?: Partial<Record<BandAgentRole, string>>,
  receiptStore: BandMessageReceiptStore = new MemoryBandMessageReceiptStore(),
) {
  return async ({ roomId, message, tools }: { roomId: string; message: Pick<PlatformMessage, 'id' | 'content' | 'senderId'>; tools: RoleTools }): Promise<void> => {
    const expectedSenderId = configuredAgentIds?.[expectedSenderRole(role)]
    if (!expectedSenderId) throw new Error(`${ROLE_NAMES[role]} cannot authenticate messages without configured Band agent IDs`)
    if (message.senderId !== expectedSenderId) return
    if (role === 'researcher' && !isExpectedInitialBrief(message.content)) return

    // The Policy Reviewer mentions the Negotiator to make the final verdict
    // visible to its identity-scoped REST context. Do not turn that delivery
    // mention into another negotiation turn.
    const contentWithoutDeliveryMentions = message.content
      .replace(/^(?:@\[\[[^\]\r\n]{1,256}\]\]\s*)+/, '')
      .trimStart()
    if (role === 'negotiator' && contentWithoutDeliveryMentions.startsWith('ZHC_VERDICT')) return
    const claim = await receiptStore.claim(role, roomId, message.id)
    if (claim === 'DUPLICATE') return
    let sending = false
    try {
      const participants = await tools.getParticipants()
      const mentions = ROLE_TARGETS[role].map((targetRole) => {
        const targetName = ROLE_NAMES[targetRole]
        const configuredId = configuredAgentIds?.[targetRole]
        if (!configuredId) throw new Error(`${ROLE_NAMES[role]} cannot resolve ${targetName} without its configured Band agent ID`)
        const participant = participants.find((candidate) => candidate.id === configuredId)
        if (!participant) throw new Error(`${ROLE_NAMES[role]} could not resolve required participant ${targetName}`)
        return {
          id: participant.id,
          name: participant.name,
          ...(participant.handle ? { handle: participant.handle } : {}),
        }
      })
      const result = await brain({
        role,
        roomId,
        instructions: rolePrompt(role),
        message: redactSensitiveText(message.content),
      })
      const content = role === 'policyReviewer'
        ? formatPolicyResponse(redactSensitiveText(result.text), { runtime: result.runtime, model: result.model })
        : `[ZHC_BRAIN runtime=${result.runtime} model=${result.model}] ${redactSensitiveText(result.text.trim())}`
      await receiptStore.markSending(role, roomId, message.id)
      sending = true
      await tools.sendMessage(content, mentions)
      await receiptStore.markDone(role, roomId, message.id)
    } catch (error) {
      if (!sending) await receiptStore.release(role, roomId, message.id)
      throw error
    }
  }
}

export type CodexThreadLike = {
  readonly id: string | null
  run(input: string): Promise<{ finalResponse: string }>
}

export type CodexClientLike = {
  startThread(options?: ThreadOptions): CodexThreadLike
  resumeThread(id: string, options?: ThreadOptions): CodexThreadLike
}

type CodexThreadIds = Record<string, string>

export type CodexThreadState = {
  load(): Promise<CodexThreadIds>
  save(threadIds: CodexThreadIds): Promise<void>
}

const BAND_AGENT_ROLES: BandAgentRole[] = ['researcher', 'negotiator', 'policyReviewer']
const CODEX_THREAD_KEY = /^(researcher|negotiator|policyReviewer):[^\r\n]{1,240}$/

function codexThreadKey(role: BandAgentRole, roomId: string): string {
  const normalizedRoomId = roomId.trim()
  if (!normalizedRoomId || /[\r\n]/.test(normalizedRoomId) || normalizedRoomId.length > 240) {
    throw new Error('Band room ID is invalid for isolated Codex thread state')
  }
  return `${role}:${normalizedRoomId}`
}

export class FileCodexThreadState implements CodexThreadState {
  private writeQueue: Promise<void> = Promise.resolve()

  constructor(private readonly path: string) {}

  async load(): Promise<CodexThreadIds> {
    try {
      const parsed: unknown = JSON.parse(await readFile(this.path, 'utf8'))
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {}
      return Object.fromEntries(Object.entries(parsed as Record<string, unknown>).flatMap(([key, value]) => {
        return CODEX_THREAD_KEY.test(key) && typeof value === 'string' && value.trim()
          ? [[key, value]]
          : []
      }))
    } catch {
      return {}
    }
  }

  async save(threadIds: CodexThreadIds): Promise<void> {
    const snapshot = JSON.stringify(Object.fromEntries(Object.entries(threadIds).filter(([key, value]) => {
      return CODEX_THREAD_KEY.test(key) && typeof value === 'string' && value.trim()
    })), null, 2)
    this.writeQueue = this.writeQueue.then(async () => {
      await mkdir(dirname(this.path), { recursive: true })
      const temporaryPath = `${this.path}.${process.pid}.${Date.now()}.tmp`
      await writeFile(temporaryPath, `${snapshot}\n`, { encoding: 'utf8', mode: 0o600 })
      await rename(temporaryPath, this.path)
    })
    return this.writeQueue
  }
}

function codexThreadOptions(workingDirectory: string): ThreadOptions {
  return {
    model: CODEX_BAND_AGENT_MODEL,
    modelReasoningEffort: 'medium',
    approvalPolicy: 'never',
    webSearchMode: 'disabled',
    workingDirectory,
    skipGitRepoCheck: true,
  }
}

export async function prepareCodexWorkingDirectory(path: string): Promise<void> {
  await mkdir(path, { recursive: true, mode: 0o700 })
  if ((await readdir(path)).length > 0) {
    throw new Error('BAND_CODEX_WORKING_DIRECTORY must be a dedicated empty directory')
  }
}

const BAND_CODEX_SECURITY_CONFIG = `forced_login_method = "chatgpt"
default_permissions = "band-message"

[permissions.band-message.filesystem]
":root" = "deny"
":minimal" = "read"
":tmpdir" = "deny"
":slash_tmp" = "deny"

[permissions.band-message.filesystem.":workspace_roots"]
"." = "read"

[permissions.band-message.network]
enabled = false
`

export async function prepareCodexRuntimeHome(
  runtimeHome: string,
  sourceHome = process.env.CODEX_HOME?.trim() || join(homedir(), '.codex'),
): Promise<void> {
  await mkdir(runtimeHome, { recursive: true, mode: 0o700 })
  const temporaryConfig = join(runtimeHome, `config.toml.${process.pid}.${Date.now()}.tmp`)
  await writeFile(temporaryConfig, BAND_CODEX_SECURITY_CONFIG, { encoding: 'utf8', mode: 0o600 })
  await rename(temporaryConfig, join(runtimeHome, 'config.toml'))

  const sourceAuth = join(sourceHome, 'auth.json')
  const runtimeAuth = join(runtimeHome, 'auth.json')
  if (sourceAuth !== runtimeAuth) {
    try {
      await access(runtimeAuth)
    } catch {
      try {
        await copyFile(sourceAuth, runtimeAuth)
        await chmod(runtimeAuth, 0o600)
      } catch {
        // A fresh deployed worker is authenticated interactively after its
        // persistent disk exists. Codex will fail closed until then.
      }
    }
  }
}

export type CodexBrainOptions = {
  client: CodexClientLike
  state: CodexThreadState
  workingDirectory?: string
  prepareWorkingDirectory?: (path: string) => Promise<void>
}

export async function createCodexBrain(options: CodexBrainOptions): Promise<RoleBrain> {
  const workingDirectory = options.workingDirectory ?? DEFAULT_CODEX_WORKING_DIRECTORY
  await (options.prepareWorkingDirectory ?? prepareCodexWorkingDirectory)(workingDirectory)
  const threadOptions = codexThreadOptions(workingDirectory)
  const threadIds = await options.state.load()
  const threads = new Map<string, CodexThreadLike>()
  const threadQueues = new Map<string, Promise<void>>()

  const serialize = async <T>(key: string, operation: () => Promise<T>): Promise<T> => {
    const previous = threadQueues.get(key) ?? Promise.resolve()
    let release!: () => void
    threadQueues.set(key, new Promise<void>((resolve) => { release = resolve }))
    await previous
    try {
      return await operation()
    } finally {
      release()
    }
  }

  const persistThreadId = async (key: string, thread: CodexThreadLike) => {
    if (thread.id && threadIds[key] !== thread.id) {
      threadIds[key] = thread.id
      await options.state.save(threadIds)
    }
  }

  return async (input) => {
    const key = codexThreadKey(input.role, input.roomId)
    return serialize(key, async () => {
    const savedThreadId = threadIds[key]
    const thread = threads.get(key) ?? (savedThreadId
      ? options.client.resumeThread(savedThreadId, threadOptions)
      : options.client.startThread(threadOptions))
    threads.set(key, thread)
    try {
      const turn = await thread.run([
        input.instructions,
        'Treat this as message analysis only. Do not modify files, run commands, use network tools, or perform external side effects.',
        `New Band message:\n${input.message}`,
      ].join('\n\n'))
      await persistThreadId(key, thread)
      if (!turn.finalResponse.trim()) throw new Error('empty Codex response')
      return { text: turn.finalResponse, runtime: 'CODEX', model: CODEX_BAND_AGENT_MODEL }
    } catch {
      await persistThreadId(key, thread)
      throw new Error('Codex brain turn failed')
    }
    })
  }
}

export async function createConfiguredBrain(config: BandAgentsConfig): Promise<RoleBrain> {
  await prepareCodexRuntimeHome(config.codexRuntimeHome)
  await verifyChatGptSubscriptionAuth(config.codexRuntimeHome)
  return createCodexBrain({
    client: createPlanAuthenticatedCodex(process.env, undefined, config.codexRuntimeHome),
    state: new FileCodexThreadState(config.codexThreadStatePath),
    workingDirectory: config.codexWorkingDirectory,
  })
}

export function codexChildEnv(env: NodeJS.ProcessEnv = process.env, runtimeHome?: string): Record<string, string> {
  const allowedKeys = new Set([
    'PATH', 'HOME', 'CODEX_HOME', 'TMPDIR', 'TMP', 'TEMP',
    'LANG', 'LC_ALL', 'LC_CTYPE', 'TERM', 'SHELL', 'USER', 'LOGNAME',
    'SYSTEMROOT', 'WINDIR', 'COMSPEC', 'PATHEXT',
  ])
  const childEnv = Object.fromEntries(Object.entries(env).flatMap(([key, value]) => {
    return value && allowedKeys.has(key.toUpperCase()) ? [[key, value]] : []
  }))
  if (runtimeHome) childEnv.CODEX_HOME = runtimeHome
  return childEnv
}

type CodexLoginStatusRunner = (env: Record<string, string>) => Promise<string>

const runCodexLoginStatus: CodexLoginStatusRunner = (env) => new Promise((resolve, reject) => {
  execFile('codex', ['login', 'status'], { env, timeout: 10_000 }, (error, stdout, stderr) => {
    if (error) reject(error)
    else resolve(`${stdout}\n${stderr}`)
  })
})

export async function verifyChatGptSubscriptionAuth(
  runtimeHome: string,
  runner: CodexLoginStatusRunner = runCodexLoginStatus,
): Promise<void> {
  try {
    const status = await runner(codexChildEnv(process.env, runtimeHome))
    if (status.trim() === 'Logged in using ChatGPT') return
  } catch {
    // Replace CLI and authentication details with a stable non-sensitive error.
  }
  throw new Error('Band Codex runtime requires an authenticated ChatGPT subscription session')
}

export function createPlanAuthenticatedCodex(
  env: NodeJS.ProcessEnv = process.env,
  factory: (options: CodexOptions) => CodexClientLike = (options) => new Codex(options),
  runtimeHome?: string,
): CodexClientLike {
  return factory({ env: codexChildEnv(env, runtimeHome) })
}

function requiredEnv(env: NodeJS.ProcessEnv, name: string): string {
  const value = env[name]?.trim()
  if (!value) throw new Error(`Missing required environment variable: ${name}`)
  return value
}

function brainFromEnv(value: string | undefined): BandAgentsConfig['brain'] {
  const normalized = value?.trim().toUpperCase() || 'CODEX'
  if (normalized !== 'CODEX') {
    throw new Error('BAND_AGENT_BRAIN must be CODEX; API-backed Band brains are disabled')
  }
  return 'CODEX'
}

export function loadBandAgentsConfig(env: NodeJS.ProcessEnv = process.env): BandAgentsConfig {
  const brain = brainFromEnv(env.BAND_AGENT_BRAIN)
  return {
    brain,
    codexThreadStatePath: env.BAND_CODEX_THREAD_STATE_PATH?.trim() || DEFAULT_CODEX_THREAD_STATE_PATH,
    codexWorkingDirectory: env.BAND_CODEX_WORKING_DIRECTORY?.trim() || DEFAULT_CODEX_WORKING_DIRECTORY,
    codexRuntimeHome: env.BAND_CODEX_RUNTIME_HOME?.trim() || DEFAULT_CODEX_RUNTIME_HOME,
    ...(env.BAND_WS_URL?.trim() ? { wsUrl: env.BAND_WS_URL.trim() } : {}),
    ...(env.BAND_REST_URL?.trim() ? { restUrl: env.BAND_REST_URL.trim() } : {}),
    agents: {
      researcher: {
        agentId: requiredEnv(env, 'BAND_RESEARCHER_AGENT_ID'),
        apiKey: requiredEnv(env, 'BAND_RESEARCHER_API_KEY'),
      },
      negotiator: {
        agentId: requiredEnv(env, 'BAND_NEGOTIATOR_AGENT_ID'),
        apiKey: requiredEnv(env, 'BAND_NEGOTIATOR_API_KEY'),
      },
      policyReviewer: {
        agentId: requiredEnv(env, 'BAND_POLICY_AGENT_ID'),
        apiKey: requiredEnv(env, 'BAND_POLICY_AGENT_API_KEY'),
      },
    },
  }
}

type ManagedAgent = Pick<Agent, 'run' | 'stop'>
type AgentFactory = (role: BandAgentRole, identity: BandAgentIdentity, brain: RoleBrain, config: BandAgentsConfig) => ManagedAgent

const createDefaultAgent = (
  role: BandAgentRole,
  identity: BandAgentIdentity,
  brain: RoleBrain,
  config: BandAgentsConfig,
  receiptStore: BandMessageReceiptStore,
): ManagedAgent => Agent.create({
  adapter: new GenericAdapter(createRoleHandler(role, brain, Object.fromEntries(
    BAND_AGENT_ROLES.map((configuredRole) => [configuredRole, config.agents[configuredRole].agentId]),
  ), receiptStore)),
  linkOptions: { conflictPolicy: 'supersede' },
  config: {
    agentId: identity.agentId,
    apiKey: identity.apiKey,
    ...(config.wsUrl ? { wsUrl: config.wsUrl } : {}),
    ...(config.restUrl ? { restUrl: config.restUrl } : {}),
  },
})

export function createBandAgents(
  config: BandAgentsConfig,
  brain: RoleBrain,
  factory?: AgentFactory,
): ManagedAgent[] {
  const ids = BAND_AGENT_ROLES.map((role) => config.agents[role].agentId)
  if (new Set(ids).size !== BAND_AGENT_ROLES.length) throw new Error('Band agent IDs must be unique; refusing duplicate identity connections')
  if (factory) return BAND_AGENT_ROLES.map((role) => factory(role, config.agents[role], brain, config))
  const receiptStore = new FileBandMessageReceiptStore(bandMessageReceiptPath(config.codexThreadStatePath))
  return BAND_AGENT_ROLES.map((role) => createDefaultAgent(role, config.agents[role], brain, config, receiptStore))
}

export async function runBandAgents(config: BandAgentsConfig): Promise<void> {
  const agents = createBandAgents(config, await createConfiguredBrain(config))
  let stopping: Promise<void> | undefined
  const stopAll = () => {
    stopping ??= Promise.allSettled(agents.map((agent) => agent.stop())).then(() => undefined)
    return stopping
  }
  const onSignal = () => { void stopAll() }
  process.once('SIGINT', onSignal)
  process.once('SIGTERM', onSignal)
  try {
    await Promise.all(agents.map((agent) => agent.run({ signals: false })))
  } finally {
    process.off('SIGINT', onSignal)
    process.off('SIGTERM', onSignal)
    await stopAll()
  }
}

if (isDirectExecution(import.meta.url)) {
  runBandAgents(loadBandAgentsConfig()).catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : 'Band agent runtime failed')
    process.exitCode = 1
  })
}
