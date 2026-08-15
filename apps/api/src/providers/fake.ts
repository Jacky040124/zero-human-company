import type { Provider } from '@zero-human/contracts'
import type {
  ProviderCapabilities,
  ProviderPort,
  ProviderRequest,
  ProviderResult,
} from './types.js'

export class FakeProvider<
  TRequest,
  TResponse extends Record<string, unknown> = Record<string, unknown>,
> implements ProviderPort<TRequest, TResponse> {
  constructor(
    readonly provider: Provider,
    private readonly operation: string,
    private readonly dataFactory?: (request: ProviderRequest<TRequest>) => TResponse,
  ) {}

  capabilities(): ProviderCapabilities {
    return { live: false, idempotency: 'native', operations: [this.operation] }
  }

  async preflight(): Promise<void> {}

  async execute(request: ProviderRequest<TRequest>): Promise<ProviderResult<TResponse>> {
    const externalId = `fake_${this.provider.toLowerCase()}_${request.idempotencyKey}`
    return {
      provider: this.provider,
      externalId,
      live: false,
      status: 'COMPLETE',
      data: this.dataFactory?.(request) ?? { accepted: true } as unknown as TResponse,
      redacted: { externalId, operation: this.operation },
    }
  }
}
