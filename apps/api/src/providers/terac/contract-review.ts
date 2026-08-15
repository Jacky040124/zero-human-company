import { bearerHeaders, providerJson } from '../http.js'
import { requireConfig, sanitizedExternalId, type ProviderCapabilities, type ProviderPort, type ProviderRequest, type ProviderResult } from '../types.js'
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
  async preflight(): Promise<void> { this.required() }
  async execute(request: ProviderRequest<ContractReviewRequest>): Promise<ProviderResult<ContractReviewResult>> {
    const config = this.required()
    const raw = await providerJson<unknown>(new URL(config.path, config.baseUrl).toString(), {
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
