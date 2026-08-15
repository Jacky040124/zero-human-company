import type { Provider } from '@zero-human/contracts'

export type ProviderCapabilities = {
  live: boolean
  idempotency: 'native' | 'reconcile' | 'manual'
  operations: readonly string[]
}

export type ProviderResult<T = Record<string, unknown>> = {
  provider: Provider
  externalId: string
  live: boolean
  status: string
  data: T
  redacted: Record<string, unknown>
}

export type ProviderRequest<T> = {
  demoRunId: string
  idempotencyKey: string
  payload: T
}

export type ProviderReconcileContext<T> = ProviderRequest<T> & {
  externalHint?: string
}

export interface ProviderPort<TRequest, TResponse = Record<string, unknown>> {
  readonly provider: Provider
  capabilities(): ProviderCapabilities
  preflight(): Promise<void>
  execute(request: ProviderRequest<TRequest>): Promise<ProviderResult<TResponse>>
  reconcile?(
    idempotencyKey: string,
    context?: ProviderReconcileContext<TRequest>,
  ): Promise<ProviderResult<TResponse> | null>
}

export class ProviderConfigurationError extends Error {
  constructor(provider: Provider, missing: string[]) {
    super(`${provider} is missing required configuration: ${missing.join(', ')}`)
    this.name = 'ProviderConfigurationError'
  }
}

export class ProviderOutcomeUnknownError extends Error {
  constructor(message: string, readonly externalHint?: string) {
    super(message)
    this.name = 'ProviderOutcomeUnknownError'
  }
}

export function requireConfig(
  provider: Provider,
  values: Record<string, string | undefined>,
): Record<string, string> {
  const missing = Object.entries(values)
    .filter(([, value]) => !value)
    .map(([key]) => key)
  if (missing.length) throw new ProviderConfigurationError(provider, missing)
  return Object.fromEntries(Object.entries(values).map(([key, value]) => [key, value as string]))
}

export function sanitizedExternalId(provider: Provider, id: string): string {
  return `${provider.toLowerCase()}:${id}`
}
