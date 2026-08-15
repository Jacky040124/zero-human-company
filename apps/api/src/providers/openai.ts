import OpenAI from 'openai'
import { zodTextFormat } from 'openai/helpers/zod'
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

export class OpenAISalesProvider implements ProviderPort<SalesDraftRequest, z.infer<typeof salesDraftSchema>> {
  readonly provider = 'OPENAI' as const
  private readonly client: OpenAI

  constructor(apiKey: string | undefined, private readonly model = 'gpt-5.6-luna') {
    const config = requireConfig('OPENAI', { OPENAI_API_KEY: apiKey })
    if (model !== 'gpt-5.6-luna') throw new Error('This project is locked to gpt-5.6-luna')
    this.client = new OpenAI({ apiKey: config.OPENAI_API_KEY })
  }

  capabilities(): ProviderCapabilities {
    return { live: true, idempotency: 'reconcile', operations: ['structured-outreach'] }
  }

  async preflight(): Promise<void> {
    if (this.model !== 'gpt-5.6-luna') throw new Error('Unexpected OpenAI model')
  }

  async execute(request: ProviderRequest<SalesDraftRequest>): Promise<ProviderResult<z.infer<typeof salesDraftSchema>>> {
    const response = await this.client.responses.parse({
      model: this.model,
      reasoning: { effort: 'medium' },
      input: [
        {
          role: 'system',
          content: 'You draft concise B2B furniture outreach only for explicitly consenting hackathon role-players. Use only supplied evidence. Flag any unsupported or binding claim for human review.',
        },
        {
          role: 'user',
          content: JSON.stringify({ ...request.payload, idempotencyReference: request.idempotencyKey }),
        },
      ],
      text: { format: zodTextFormat(salesDraftSchema, 'sales_draft') },
    })
    if (!response.output_parsed) throw new Error('OpenAI returned no schema-valid sales draft')
    return {
      provider: 'OPENAI',
      externalId: response.id,
      live: true,
      status: 'COMPLETE',
      data: response.output_parsed,
      redacted: { responseId: response.id, model: this.model, needsHumanReview: response.output_parsed.needsHumanReview },
    }
  }
}
