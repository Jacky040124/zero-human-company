import { z } from 'zod'
import { bearerHeaders, providerJson } from '../http.js'
import {
  requireConfig,
  sanitizedExternalId,
  type ProviderCapabilities,
  type ProviderPort,
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

const rawCompanySchema = z.object({
  id: z.union([z.string(), z.number()]).optional(),
  companyId: z.union([z.string(), z.number()]).optional(),
  externalId: z.union([z.string(), z.number()]).optional(),
  name: z.string().min(1),
  website: z.string().nullable().optional(),
  url: z.string().nullable().optional(),
  country: z.string().nullable().optional(),
  description: z.string().nullable().optional(),
}).passthrough()

const discoveryResponseSchema = z.object({
  runId: z.union([z.string(), z.number()]),
  companies: z.array(rawCompanySchema),
})

export type MonidCodecs = {
  decodeDiscoveryResponse(value: unknown): {
    externalRunId: string
    companies: unknown[]
  }
}

export type MonidRoutes = {
  discovery: string
}

export type MonidConfig = {
  baseUrl?: string
  apiKey?: string
  routes?: Partial<MonidRoutes>
  codecs?: Partial<MonidCodecs>
  timeoutMs?: number
}

type MonidTransport = (url: string, init: RequestInit, timeoutMs?: number) => Promise<unknown>

const defaultCodecs: MonidCodecs = {
  decodeDiscoveryResponse(value) {
    const parsed = discoveryResponseSchema.parse(value)
    return {
      externalRunId: String(parsed.runId),
      companies: parsed.companies,
    }
  },
}

export function normalizeMonidCompany(value: unknown): MonidCompany {
  const parsed = rawCompanySchema.parse(value)
  const externalId = parsed.id ?? parsed.companyId ?? parsed.externalId
  if (externalId === undefined) {
    throw new Error(`Monid company ${parsed.name} is missing an external ID`)
  }

  const source = Object.fromEntries(
    Object.entries(parsed).filter(([key]) => !/(?:contact|email|phone)/i.test(key)),
  )

  return {
    externalCompanyId: String(externalId),
    name: parsed.name.trim(),
    website: parsed.website ?? parsed.url ?? null,
    country: parsed.country ?? null,
    description: parsed.description ?? null,
    researchOnly: true,
    source,
  }
}

export class MonidDiscoveryProvider implements ProviderPort<MonidDiscoveryRequest, MonidDiscoveryResult> {
  readonly provider = 'MONID' as const
  private readonly routes: MonidRoutes
  private readonly codecs: MonidCodecs

  constructor(
    private readonly config: MonidConfig,
    private readonly transport: MonidTransport = providerJson,
  ) {
    this.routes = { discovery: '/discovery/runs', ...config.routes }
    this.codecs = { ...defaultCodecs, ...config.codecs }
  }

  capabilities(): ProviderCapabilities {
    return { live: true, idempotency: 'native', operations: ['research.discovery'] }
  }

  async preflight(): Promise<void> {
    requireConfig(this.provider, {
      MONID_BASE_URL: this.config.baseUrl,
      MONID_API_KEY: this.config.apiKey,
    })
  }

  async execute(
    request: ProviderRequest<MonidDiscoveryRequest>,
  ): Promise<ProviderResult<MonidDiscoveryResult>> {
    await this.preflight()
    const baseUrl = this.config.baseUrl as string
    const apiKey = this.config.apiKey as string
    const response = await this.transport(
      new URL(this.routes.discovery, baseUrl).toString(),
      {
        method: 'POST',
        headers: bearerHeaders(apiKey, request.idempotencyKey),
        body: JSON.stringify({
          query: request.payload.query,
          maxResults: request.payload.maxResults,
          filters: request.payload.filters,
          mode: 'research_only',
        }),
      },
      this.config.timeoutMs,
    )
    const decoded = this.codecs.decodeDiscoveryResponse(response)
    const data: MonidDiscoveryResult = {
      externalRunId: decoded.externalRunId,
      companies: decoded.companies.map(normalizeMonidCompany),
      researchOnly: true,
    }
    const externalId = sanitizedExternalId(this.provider, decoded.externalRunId)

    return {
      provider: this.provider,
      externalId,
      live: true,
      status: 'COMPLETE',
      data,
      redacted: {
        externalRunId: decoded.externalRunId,
        externalCompanyIds: data.companies.map((company) => company.externalCompanyId),
        researchOnly: true,
      },
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

  async execute(
    request: ProviderRequest<MonidDiscoveryRequest>,
  ): Promise<ProviderResult<MonidDiscoveryResult>> {
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
        externalRunId,
        externalCompanyIds: [company.externalCompanyId],
        researchOnly: true,
      },
    }
  }
}
