import OpenAI from 'openai'
import { zodResponseFormat } from 'openai/helpers/zod'
import { z } from 'zod'
import type { ProviderCapabilities, ProviderPort, ProviderRequest, ProviderResult } from './types.js'
import { requireConfig } from './types.js'

export const salesDraftSchema = z.object({
  subject: z.string().min(1).max(120),
  body: z.string().min(1).max(1600),
  claims: z.array(z.string()).max(8),
  needsHumanReview: z.boolean(),
  reviewReason: z.string().nullable(),
})

export type SalesDraftRequest = {
  company: string
  rolePlayerName: string
  product: string
  evidence: string[]
  objective: string
}

export const OPENROUTER_BASE_URL = 'https://openrouter.ai/api/v1'
export const OPENROUTER_OUTREACH_MODEL = 'openai/gpt-5.6-luna'

export class OpenRouterSalesProvider implements ProviderPort<SalesDraftRequest, z.infer<typeof salesDraftSchema>> {
  readonly provider = 'OPENAI' as const
  private readonly client: OpenAI

  constructor(
    apiKey: string | undefined,
    private readonly model = OPENROUTER_OUTREACH_MODEL,
    private readonly baseURL = OPENROUTER_BASE_URL,
    client?: OpenAI,
  ) {
    const config = requireConfig('OPENAI', { OPENROUTER_API_KEY: apiKey })
    if (model !== OPENROUTER_OUTREACH_MODEL) throw new Error(`This project is locked to ${OPENROUTER_OUTREACH_MODEL}`)
    if (baseURL !== OPENROUTER_BASE_URL) throw new Error(`This project is locked to ${OPENROUTER_BASE_URL}`)
    this.client = client ?? new OpenAI({ apiKey: config.OPENROUTER_API_KEY, baseURL })
  }

  capabilities(): ProviderCapabilities {
    return { live: true, idempotency: 'reconcile', operations: ['structured-outreach'] }
  }

  async preflight(): Promise<void> {
    if (this.model !== OPENROUTER_OUTREACH_MODEL || this.baseURL !== OPENROUTER_BASE_URL) {
      throw new Error('Unexpected OpenRouter outreach configuration')
    }
  }

  async execute(request: ProviderRequest<SalesDraftRequest>): Promise<ProviderResult<z.infer<typeof salesDraftSchema>>> {
    const completion = await this.client.chat.completions.parse({
      model: this.model,
      reasoning_effort: 'medium',
      // OpenRouter can otherwise fall back to an endpoint that silently drops
      // unsupported parameters, including the JSON schema below.
      ...{ provider: { require_parameters: true } },
      messages: [
        {
          role: 'system',
          content: 'You draft concise B2B furniture outreach only for explicitly consenting hackathon role-players. Use only supplied evidence. Flag any unsupported or binding claim for human review.',
        },
        {
          role: 'user',
          content: JSON.stringify({ ...request.payload, idempotencyReference: request.idempotencyKey }),
        },
      ],
      response_format: zodResponseFormat(salesDraftSchema, 'sales_draft'),
    })
    const draft = completion.choices[0]?.message.parsed
    if (!draft) throw new Error('OpenRouter returned no schema-valid sales draft')
    return {
      provider: 'OPENAI',
      externalId: completion.id,
      live: true,
      status: 'COMPLETE',
      data: draft,
      redacted: {
        responseId: completion.id,
        router: 'OPENROUTER',
        model: this.model,
        needsHumanReview: draft.needsHumanReview,
      },
    }
  }
}
