import type { Provider } from '@zero-human/contracts'
import type {
  ProviderCapabilities,
  ProviderPort,
  ProviderRequest,
  ProviderResult,
} from './types.js'

export class FakeProvider<TRequest> implements ProviderPort<TRequest> {
  constructor(
    readonly provider: Provider,
    private readonly operation: string,
  ) {}

  capabilities(): ProviderCapabilities {
    return { live: false, idempotency: 'native', operations: [this.operation] }
  }

  async preflight(): Promise<void> {}

  async execute(request: ProviderRequest<TRequest>): Promise<ProviderResult> {
    const externalId = `fake_${this.provider.toLowerCase()}_${request.idempotencyKey}`
    return {
      provider: this.provider,
      externalId,
      live: false,
      status: 'COMPLETE',
      data: { accepted: true },
      redacted: { externalId, operation: this.operation },
    }
  }
}
