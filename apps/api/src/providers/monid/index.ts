import { z } from 'zod'
import { bearerHeaders, providerJson } from '../http.js'
import {
  ProviderConfigurationError,
  ProviderOutcomeUnknownError,
  requireConfig,
  sanitizedExternalId,
  type ProviderCapabilities,
  type ProviderPort,
  type ProviderReconcileContext,
  type ProviderRequest,
  type ProviderResult,
} from '../types.js'

export type MonidDiscoveryRequest = {
  query: string
  maxResults?: number
  filters?: Record<string, string | number | boolean>
}

export type MonidCompany = {
  externalCompanyId: string
  name: string
  website: string | null
  country: string | null
  description: string | null
  researchOnly: true
  source: Record<string, unknown>
}

export type MonidDiscoveryResult = {
  externalRunId: string
  companies: MonidCompany[]
  researchOnly: true
}

const ALLOWED_PROVIDER = 'apollo'
const ALLOWED_ENDPOINT = '/mixed_companies/search'

const rawCompanySchema = z.object({
  id: z.union([z.string(), z.number()]).optional(),
  organization_id: z.union([z.string(), z.number()]).optional(),
  companyId: z.union([z.string(), z.number()]).optional(),
  externalId: z.union([z.string(), z.number()]).optional(),
  name: z.string().min(1),
  website: z.string().nullable().optional(),
  website_url: z.string().nullable().optional(),
  primary_domain: z.string().nullable().optional(),
  url: z.string().nullable().optional(),
  country: z.string().nullable().optional(),
  description: z.string().nullable().optional(),
  short_description: z.string().nullable().optional(),
}).passthrough()

const discoverResponseSchema = z.object({
  results: z.array(z.object({
    provider: z.string(),
    endpoint: z.string(),
  }).passthrough()),
}).passthrough()

const inspectResponseSchema = z.object({
  provider: z.string(),
  endpoint: z.string(),
  input: z.object({
    queryParams: z.unknown(),
  }).passthrough().optional(),
  inputSchema: z.unknown().optional(),
}).passthrough().refine((value) => value.input?.queryParams !== undefined || value.inputSchema !== undefined, {
  message: 'Inspect response did not include input.queryParams or inputSchema',
})

const runIdentitySchema = z.object({
  runId: z.union([z.string(), z.number()]),
}).passthrough()

const runResponseSchema = z.object({
  runId: z.union([z.string(), z.number()]),
  provider: z.string(),
  endpoint: z.string(),
  status: z.enum(['READY', 'RUNNING', 'COMPLETED', 'FAILED']),
  input: z.unknown().optional(),
  providerResponse: z.object({
    httpStatus: z.number().int().optional(),
  }).passthrough().nullable().optional(),
  output: z.object({
    organizations: z.array(z.unknown()),
  }).passthrough().nullable().optional(),
}).passthrough()

export type MonidRoutes = {
  discover: string
  inspect: string
  run: string
  runStatus(runId: string): string
}

export type MonidConfig = {
  baseUrl?: string
  apiKey?: string
  routes?: Partial<MonidRoutes>
  timeoutMs?: number
  pollIntervalMs?: number
  maxPollDurationMs?: number
}

type MonidTransport = (url: string, init: RequestInit, timeoutMs?: number) => Promise<unknown>
type MonidSleep = (milliseconds: number) => Promise<void>

const defaultRoutes: MonidRoutes = {
  discover: '/v1/discover',
  inspect: '/v1/inspect',
  run: '/v1/run',
  runStatus: (runId) => `/v1/runs/${encodeURIComponent(runId)}`,
}

const defaultSleep: MonidSleep = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds))

function redactResearchText(value: string): string {
  return value
    .replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, '[REDACTED_EMAIL]')
    .replace(/(?<!\w)(?:\+?\d[\d ().-]{7,}\d)(?!\w)/g, '[REDACTED_PHONE]')
    .replace(/(?:https?:\/\/)?(?:www\.)?(?:linkedin\.com|twitter\.com|x\.com|facebook\.com|instagram\.com|github\.com)\/[^\s]+/gi, '[REDACTED_PROFILE]')
    .replace(/(^|\s)@[A-Z0-9_]{2,}/gi, '$1[REDACTED_USERNAME]')
}

function organizationUrl(value: string | null | undefined): string | null {
  if (!value) return null
  if (/(?:linkedin\.com|twitter\.com|x\.com|facebook\.com|instagram\.com|github\.com)|\/(?:in|people|person|profile|users?)\//i.test(value)) {
    return null
  }
  return redactResearchText(value)
}

function organizationSource(parsed: z.infer<typeof rawCompanySchema>): Record<string, unknown> {
  const source: Record<string, unknown> = { name: parsed.name.trim() }
  for (const key of ['id', 'organization_id', 'companyId', 'externalId'] as const) {
    if (parsed[key] !== undefined) source[key] = parsed[key]
  }
  for (const key of ['website', 'website_url', 'url'] as const) {
    if (parsed[key] !== undefined) source[key] = organizationUrl(parsed[key])
  }
  if (parsed.primary_domain !== undefined) source.primary_domain = organizationUrl(parsed.primary_domain)
  if (parsed.country !== undefined) source.country = parsed.country
  if (parsed.description !== undefined) source.description = parsed.description === null ? null : redactResearchText(parsed.description)
  if (parsed.short_description !== undefined) {
    source.short_description = parsed.short_description === null ? null : redactResearchText(parsed.short_description)
  }
  return source
}

export function normalizeMonidCompany(value: unknown): MonidCompany {
  const parsed = rawCompanySchema.parse(value)
  const externalId = parsed.id ?? parsed.organization_id ?? parsed.companyId ?? parsed.externalId
  if (externalId === undefined) throw new Error(`Monid company ${parsed.name} is missing an external ID`)
  const primaryDomain = organizationUrl(parsed.primary_domain)

  return {
    externalCompanyId: String(externalId),
    name: parsed.name.trim(),
    website: organizationUrl(parsed.website) ?? organizationUrl(parsed.website_url) ?? organizationUrl(parsed.url)
      ?? (primaryDomain ? `https://${primaryDomain}` : null),
    country: parsed.country ?? null,
    description: parsed.description !== undefined && parsed.description !== null
      ? redactResearchText(parsed.description)
      : parsed.short_description !== undefined && parsed.short_description !== null
        ? redactResearchText(parsed.short_description)
        : null,
    researchOnly: true,
    source: organizationSource(parsed),
  }
}

function queryParameterNames(value: unknown): Set<string> {
  if (Array.isArray(value)) {
    return new Set(value.flatMap((item) => item && typeof item === 'object' && typeof (item as { name?: unknown }).name === 'string'
      ? [(item as { name: string }).name]
      : []))
  }
  if (!value || typeof value !== 'object') return new Set()
  const record = value as Record<string, unknown>
  const properties = record.properties && typeof record.properties === 'object' && !Array.isArray(record.properties)
    ? record.properties as Record<string, unknown>
    : record
  return new Set(Object.keys(properties))
}

function apolloSearchQuery(request: MonidDiscoveryRequest): Record<string, unknown> {
  const region = typeof request.filters?.region === 'string' ? request.filters.region : 'Europe'
  const buyerType = typeof request.filters?.buyerType === 'string' ? request.filters.buyerType : 'importer'
  return {
    'q_organization_keyword_tags[]': [request.query, 'furniture', buyerType],
    'organization_locations[]': [region],
    page: 1,
    per_page: Math.min(Math.max(request.maxResults ?? 8, 1), 25),
  }
}

function buildApolloQuery(request: MonidDiscoveryRequest, queryParams: unknown): Record<string, unknown> {
  const names = queryParameterNames(queryParams)
  const keywordKey = ['q_organization_keyword_tags[]', 'q_organization_keyword_tags', 'q_organization_keyword'].find((key) => names.has(key))
  const locationKey = ['organization_locations[]', 'organization_locations', 'organization_location'].find((key) => names.has(key))
  if (!keywordKey || !locationKey) {
    throw new Error('Monid Apollo endpoint does not expose the required keyword and location query parameters')
  }
  const defaults = apolloSearchQuery(request)
  const query: Record<string, unknown> = {
    [keywordKey]: defaults['q_organization_keyword_tags[]'],
    [locationKey]: defaults['organization_locations[]'],
  }
  if (names.has('page')) query.page = defaults.page
  if (names.has('per_page')) query.per_page = defaults.per_page
  return query
}

function buildInspectedInput(
  request: MonidDiscoveryRequest,
  inspected: z.infer<typeof inspectResponseSchema>,
): Record<string, unknown> {
  if (inspected.input?.queryParams !== undefined) {
    return { queryParams: buildApolloQuery(request, inspected.input.queryParams) }
  }
  return buildApolloQuery(request, inspected.inputSchema)
}

function isExpectedSubset(actual: unknown, expected: unknown): boolean {
  if (Array.isArray(expected)) {
    return Array.isArray(actual) && actual.length === expected.length
      && expected.every((item, index) => isExpectedSubset(actual[index], item))
  }
  if (expected && typeof expected === 'object') {
    if (!actual || typeof actual !== 'object' || Array.isArray(actual)) return false
    return Object.entries(expected).every(([key, value]) => isExpectedSubset((actual as Record<string, unknown>)[key], value))
  }
  return Object.is(actual, expected)
}

function inputMatchesOriginalRequest(actual: unknown, request: MonidDiscoveryRequest): boolean {
  if (!actual || typeof actual !== 'object' || Array.isArray(actual)) return false
  const topLevel = actual as Record<string, unknown>
  const input = topLevel.queryParams && typeof topLevel.queryParams === 'object' && !Array.isArray(topLevel.queryParams)
    ? topLevel.queryParams as Record<string, unknown>
    : topLevel
  const keywordKey = ['q_organization_keyword_tags[]', 'q_organization_keyword_tags', 'q_organization_keyword']
    .find((key) => key in input)
  const locationKey = ['organization_locations[]', 'organization_locations', 'organization_location']
    .find((key) => key in input)
  if (!keywordKey || !locationKey) return false
  const region = typeof request.filters?.region === 'string' ? request.filters.region : 'Europe'
  const buyerType = typeof request.filters?.buyerType === 'string' ? request.filters.buyerType : 'importer'
  if (!isExpectedSubset(input[keywordKey], [request.query, 'furniture', buyerType])) return false
  if (!isExpectedSubset(input[locationKey], [region])) return false
  if ('page' in input && input.page !== 1) return false
  if ('per_page' in input && input.per_page !== Math.min(Math.max(request.maxResults ?? 8, 1), 100)) return false
  return true
}

export class MonidDiscoveryProvider implements ProviderPort<MonidDiscoveryRequest, MonidDiscoveryResult> {
  readonly provider = 'MONID' as const
  private readonly routes: MonidRoutes
  private readonly pollIntervalMs: number
  private readonly maxPollDurationMs: number

  constructor(
    private readonly config: MonidConfig,
    private readonly transport: MonidTransport = providerJson,
    private readonly sleep: MonidSleep = defaultSleep,
  ) {
    this.routes = { ...defaultRoutes, ...config.routes }
    this.pollIntervalMs = config.pollIntervalMs ?? 2_000
    this.maxPollDurationMs = config.maxPollDurationMs ?? 120_000
  }

  capabilities(): ProviderCapabilities {
    return { live: true, idempotency: 'reconcile', operations: ['research.discovery'] }
  }

  async preflight(): Promise<void> {
    requireConfig(this.provider, {
      MONID_API_BASE_URL: this.config.baseUrl,
      MONID_API_KEY: this.config.apiKey,
    })
    this.requestUrl(this.routes.discover, 'discover route')
    this.requestUrl(this.routes.inspect, 'inspect route')
    this.requestUrl(this.routes.run, 'run route')
    this.requestUrl(this.routes.runStatus('preflight'), 'run status route')
  }

  async searchApollo(request: ProviderRequest<MonidDiscoveryRequest>): Promise<ProviderResult<MonidDiscoveryResult>> {
    await this.preflight()
    return this.startApolloRun(request, { queryParams: apolloSearchQuery(request.payload) })
  }

  async execute(request: ProviderRequest<MonidDiscoveryRequest>): Promise<ProviderResult<MonidDiscoveryResult>> {
    await this.preflight()
    const discovery = discoverResponseSchema.parse(await this.readOnlyCall('discovery', this.routes.discover, {
      method: 'POST',
      headers: this.headers(),
      body: JSON.stringify({ query: 'company organization search by keywords and locations', limit: 20 }),
    }))
    const allowed = discovery.results.find((result) => result.provider.toLowerCase() === ALLOWED_PROVIDER
      && result.endpoint === ALLOWED_ENDPOINT)
    if (!allowed) throw new Error(`Monid discovery did not return allowlisted endpoint ${ALLOWED_PROVIDER} ${ALLOWED_ENDPOINT}`)

    const inspected = inspectResponseSchema.parse(await this.readOnlyCall('inspection', this.routes.inspect, {
      method: 'POST',
      headers: this.headers(),
      body: JSON.stringify({ provider: ALLOWED_PROVIDER, endpoint: ALLOWED_ENDPOINT }),
    }))
    if (inspected.provider.toLowerCase() !== ALLOWED_PROVIDER || inspected.endpoint !== ALLOWED_ENDPOINT) {
      throw new Error('Monid inspect returned a different endpoint than the allowlisted discovery result')
    }
    return this.startApolloRun(request, buildInspectedInput(request.payload, inspected))
  }

  private async startApolloRun(
    request: ProviderRequest<MonidDiscoveryRequest>,
    runInput: Record<string, unknown>,
  ): Promise<ProviderResult<MonidDiscoveryResult>> {
    let started: unknown
    try {
      started = await this.call(this.routes.run, {
        method: 'POST',
        headers: this.headers(request.idempotencyKey),
        body: JSON.stringify({
          provider: ALLOWED_PROVIDER,
          endpoint: ALLOWED_ENDPOINT,
          input: runInput,
        }),
      })
    } catch (error) {
      if (error instanceof ProviderConfigurationError) throw error
      throw new ProviderOutcomeUnknownError('Monid paid run outcome is unknown and must not be rerun automatically')
    }

    const identity = runIdentitySchema.safeParse(started)
    if (!identity.success) {
      throw new ProviderOutcomeUnknownError('Monid accepted a paid run without returning a recoverable run ID')
    }
    const runId = String(identity.data.runId)
    try {
      return this.completeRun(await this.resolveRun(started, runId), runId, request.payload, runInput)
    } catch (error) {
      if (error instanceof ProviderConfigurationError) throw error
      throw this.preserveRunFailure(runId, error, 'Monid paid run could not be safely completed')
    }
  }

  async reconcile(
    _idempotencyKey: string,
    context?: ProviderReconcileContext<MonidDiscoveryRequest>,
  ): Promise<ProviderResult<MonidDiscoveryResult> | null> {
    await this.preflight()
    const hint = context?.externalHint
    if (!hint?.startsWith('monid:') || hint.length === 'monid:'.length || !context) return null
    const runId = hint.slice('monid:'.length)
    try {
      return this.completeRun(await this.pollRun(runId), runId, context.payload)
    } catch (error) {
      if (error instanceof ProviderConfigurationError) throw error
      throw this.preserveRunFailure(runId, error, 'Monid reconciliation did not produce a safe result')
    }
  }

  private async resolveRun(value: unknown, runId: string): Promise<z.infer<typeof runResponseSchema>> {
    const parsed = runResponseSchema.safeParse(value)
    if (!parsed.success) throw this.unknownRun(runId, 'Monid returned a malformed paid run response')
    this.assertAllowedRun(parsed.data, runId)
    if (parsed.data.status === 'READY' || parsed.data.status === 'RUNNING') return this.pollRun(runId)
    return parsed.data
  }

  private async pollRun(runId: string): Promise<z.infer<typeof runResponseSchema>> {
    const attempts = Math.max(1, Math.ceil(this.maxPollDurationMs / Math.max(this.pollIntervalMs, 1)))
    for (let attempt = 0; attempt < attempts; attempt += 1) {
      if (attempt > 0 || this.pollIntervalMs > 0) await this.sleep(this.pollIntervalMs)
      let value: unknown
      try {
        value = await this.call(this.routes.runStatus(runId), { method: 'GET', headers: this.headers() })
      } catch (error) {
        if (error instanceof ProviderConfigurationError) throw error
        throw this.unknownRun(runId, 'Monid run polling outcome is uncertain')
      }
      const parsed = runResponseSchema.safeParse(value)
      if (!parsed.success || String(parsed.data.runId) !== runId) {
        throw this.unknownRun(runId, 'Monid returned an invalid reconciliation response')
      }
      this.assertAllowedRun(parsed.data, runId)
      if (parsed.data.status === 'COMPLETED' || parsed.data.status === 'FAILED') return parsed.data
    }
    throw this.unknownRun(runId, 'Monid run is still pending after bounded polling')
  }

  private completeRun(
    run: z.infer<typeof runResponseSchema>,
    runId: string,
    request: MonidDiscoveryRequest,
    expectedInput?: Record<string, unknown>,
  ): ProviderResult<MonidDiscoveryResult> {
    this.assertAllowedRun(run, runId)
    if (run.input !== undefined && !(expectedInput
      ? isExpectedSubset(run.input, expectedInput)
      : inputMatchesOriginalRequest(run.input, request))) {
      throw new Error('Monid run input did not match the inspected research request')
    }
    if (run.status === 'FAILED') throw new Error(`Monid run ${runId} failed before the provider completed`)
    if (run.status !== 'COMPLETED') throw this.unknownRun(runId, 'Monid run has not reached a terminal state')
    const httpStatus = run.providerResponse?.httpStatus
    if (httpStatus === undefined || httpStatus < 200 || httpStatus >= 300) {
      throw new Error(`Monid run ${runId} completed with provider HTTP status ${httpStatus ?? 'unknown'}`)
    }
    if (!run.output) throw new Error(`Monid run ${runId} completed without organization output`)
    const companies = run.output.organizations.map(normalizeMonidCompany)
    const externalId = sanitizedExternalId(this.provider, runId)
    const data: MonidDiscoveryResult = { externalRunId: runId, companies, researchOnly: true }
    return {
      provider: this.provider,
      externalId,
      live: true,
      status: 'COMPLETE',
      data,
      redacted: {
        externalId,
        externalCompanyIds: companies.map((company) => company.externalCompanyId),
        researchOnly: true,
      },
    }
  }

  private unknownRun(runId: string, message: string): ProviderOutcomeUnknownError {
    return new ProviderOutcomeUnknownError(message, sanitizedExternalId(this.provider, runId))
  }

  private preserveRunFailure(runId: string, error: unknown, message: string): ProviderOutcomeUnknownError {
    if (error instanceof ProviderOutcomeUnknownError && error.externalHint === sanitizedExternalId(this.provider, runId)) {
      return error
    }
    return this.unknownRun(runId, message)
  }

  private assertAllowedRun(run: z.infer<typeof runResponseSchema>, runId: string): void {
    if (String(run.runId) !== runId || run.provider.toLowerCase() !== ALLOWED_PROVIDER || run.endpoint !== ALLOWED_ENDPOINT) {
      throw this.unknownRun(runId, 'Monid run identity did not match the allowlisted endpoint')
    }
  }

  private headers(idempotencyKey?: string): Record<string, string> {
    return bearerHeaders(this.config.apiKey as string, idempotencyKey)
  }

  private call(path: string, init: RequestInit): Promise<unknown> {
    return this.transport(this.requestUrl(path, 'request route'), init, this.config.timeoutMs)
  }

  private requestUrl(path: string, label: string): string {
    let baseUrl: URL
    try {
      baseUrl = new URL(this.config.baseUrl as string)
    } catch {
      throw new ProviderConfigurationError(this.provider, ['MONID_API_BASE_URL (must be a valid HTTPS URL)'])
    }
    if (baseUrl.protocol !== 'https:') {
      throw new ProviderConfigurationError(this.provider, ['MONID_API_BASE_URL (must use https)'])
    }
    let requestUrl: URL
    try {
      requestUrl = new URL(path, baseUrl)
    } catch {
      throw new ProviderConfigurationError(this.provider, [`${label} (must be a valid relative or same-origin URL)`])
    }
    if (requestUrl.origin !== baseUrl.origin) {
      throw new ProviderConfigurationError(this.provider, [`${label} (must remain on the MONID_API_BASE_URL origin)`])
    }
    return requestUrl.toString()
  }

  private async readOnlyCall(operation: string, path: string, init: RequestInit): Promise<unknown> {
    try {
      return await this.call(path, init)
    } catch (error) {
      if (error instanceof ProviderConfigurationError) throw error
      throw new Error(`Monid read-only ${operation} failed before any paid run began`)
    }
  }
}

function slug(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'company'
}

export class FakeMonidDiscoveryProvider implements ProviderPort<MonidDiscoveryRequest, MonidDiscoveryResult> {
  readonly provider = 'MONID' as const

  capabilities(): ProviderCapabilities {
    return { live: false, idempotency: 'native', operations: ['research.discovery'] }
  }

  async preflight(): Promise<void> {}

  async execute(request: ProviderRequest<MonidDiscoveryRequest>): Promise<ProviderResult<MonidDiscoveryResult>> {
    const externalRunId = `fake-run-${request.idempotencyKey}`
    const name = request.payload.query.trim() || 'Rehearsal Company'
    const company = normalizeMonidCompany({
      id: `fake-company-${slug(name)}`,
      name,
      description: 'Deterministic research rehearsal result',
      country: null,
      website: null,
    })
    const externalId = sanitizedExternalId(this.provider, externalRunId)
    return {
      provider: this.provider,
      externalId,
      live: false,
      status: 'COMPLETE',
      data: { externalRunId, companies: [company], researchOnly: true },
      redacted: {
        externalId,
        externalCompanyIds: [company.externalCompanyId],
        researchOnly: true,
      },
    }
  }
}
