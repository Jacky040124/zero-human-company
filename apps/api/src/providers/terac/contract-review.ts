import { bearerHeaders, providerJson } from '../http.js'
import {
  ProviderConfigurationError,
  requireConfig,
  sanitizedExternalId,
  type ProviderCapabilities,
  type ProviderPort,
  type ProviderRequest,
  type ProviderResult,
} from '../types.js'
import { z } from 'zod'

export const contractReviewResultSchema = z.object({
  status: z.literal('COMPLETE'),
  taskId: z.string().min(1),
  issues: z.array(z.object({ clause: z.string(), severity: z.enum(['LOW', 'MEDIUM', 'HIGH']), finding: z.string() })),
  recommendedText: z.string().min(1),
})

export type ContractReviewRequest = {
  jurisdiction: 'Germany'
  contractText: string
  question: string
}

export type ContractReviewResult = z.infer<typeof contractReviewResultSchema>

export class TeracContractReviewProvider implements ProviderPort<ContractReviewRequest, ContractReviewResult> {
  readonly provider = 'TERAC' as const
  constructor(private readonly config: { baseUrl?: string; apiKey?: string; path?: string }) {}
  capabilities(): ProviderCapabilities { return { live: true, idempotency: 'native', operations: ['contract-review'] } }
  async preflight(): Promise<void> {
    const config = this.required()
    contractReviewRequestUrl(config.baseUrl, config.path)
  }
  async execute(request: ProviderRequest<ContractReviewRequest>): Promise<ProviderResult<ContractReviewResult>> {
    await this.preflight()
    const config = this.required()
    const raw = await providerJson<unknown>(contractReviewRequestUrl(config.baseUrl, config.path), {
      method: 'POST',
      headers: bearerHeaders(config.apiKey, request.idempotencyKey),
      body: JSON.stringify({ externalId: request.idempotencyKey, demoRunId: request.demoRunId, ...request.payload }),
    })
    const data = contractReviewResultSchema.parse(raw)
    return { provider: 'TERAC', externalId: sanitizedExternalId('TERAC', data.taskId), live: true, status: data.status, data, redacted: { taskId: data.taskId, status: data.status, issueCount: data.issues.length } }
  }
  private required(): Record<'baseUrl' | 'apiKey' | 'path', string> {
    return requireConfig('TERAC', { baseUrl: this.config.baseUrl, apiKey: this.config.apiKey, path: this.config.path }) as Record<'baseUrl' | 'apiKey' | 'path', string>
  }
}

function ensureTrailingSlash(url: string): string {
  return url.endsWith('/') ? url : `${url}/`
}

function contractReviewRequestUrl(baseUrlValue: string, path: string): string {
  let baseUrl: URL
  try {
    baseUrl = new URL(ensureTrailingSlash(baseUrlValue))
  } catch {
    throw new ProviderConfigurationError('TERAC', ['baseUrl (must be a valid HTTPS URL)'])
  }
  if (baseUrl.protocol !== 'https:') {
    throw new ProviderConfigurationError('TERAC', ['baseUrl (must use https)'])
  }
  let requestUrl: URL
  try {
    requestUrl = new URL(path, baseUrl)
  } catch {
    throw new ProviderConfigurationError('TERAC', ['path (must be a valid relative or same-origin URL)'])
  }
  if (requestUrl.origin !== baseUrl.origin) {
    throw new ProviderConfigurationError('TERAC', ['path (must remain on the baseUrl origin)'])
  }
  return requestUrl.toString()
}
