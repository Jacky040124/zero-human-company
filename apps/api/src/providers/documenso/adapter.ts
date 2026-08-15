import { providerJson } from '../http.js'
import {
  requireConfig,
  sanitizedExternalId,
  type ProviderCapabilities,
  type ProviderPort,
  type ProviderRequest,
  type ProviderResult,
} from '../types.js'
import type { DocumensoV2Codec } from './codec.js'
import {
  createEnvelopeInput,
  type DocumensoEnvelope,
  type DocumensoEnvelopeData,
  type DocumensoEnvelopeRequest,
} from './types.js'

export type DocumensoProviderConfig = {
  baseUrl?: string
  apiKey?: string
  templateId?: string
}

export class DocumensoProvider implements ProviderPort<DocumensoEnvelopeRequest, DocumensoEnvelopeData> {
  readonly provider = 'DOCUMENSO' as const

  constructor(
    private readonly config: DocumensoProviderConfig,
    private readonly codec: DocumensoV2Codec,
  ) {}

  capabilities(): ProviderCapabilities {
    return { live: true, idempotency: 'reconcile', operations: ['sequential-envelope'] }
  }

  async preflight(): Promise<void> {
    const config = this.requiredConfig()
    new URL(this.codec.createEnvelopePath(), ensureTrailingSlash(config.baseUrl))
    new URL(this.codec.reconciliationPath('preflight'), ensureTrailingSlash(config.baseUrl))
  }

  async execute(
    request: ProviderRequest<DocumensoEnvelopeRequest>,
  ): Promise<ProviderResult<DocumensoEnvelopeData>> {
    await this.preflight()
    const config = this.requiredConfig()
    // The ProviderPort reconciliation contract only carries the idempotency key,
    // so use that same stable value as Documenso's externalId.
    const input = createEnvelopeInput(
      config.templateId,
      request.demoRunId,
      request.idempotencyKey,
      request.payload,
    )
    const existing = await this.reconcileExternalId(input.externalId)
    if (existing) return this.result(existing, config.templateId)

    try {
      const response = await providerJson<unknown>(
        new URL(this.codec.createEnvelopePath(), ensureTrailingSlash(config.baseUrl)).toString(),
        {
          method: 'POST',
          headers: documensoHeaders(config.apiKey, request.idempotencyKey),
          body: JSON.stringify(this.codec.encodeCreateEnvelope(input)),
        },
      )
      const envelope = this.codec.decodeCreatedEnvelope(response)
      this.assertMatchingExternalId(envelope, input.externalId)
      return this.result(envelope, config.templateId)
    } catch (error) {
      const reconciled = await this.reconcileExternalId(input.externalId).catch(() => null)
      if (reconciled) return this.result(reconciled, config.templateId)
      throw error
    }
  }

  async reconcile(idempotencyKey: string): Promise<ProviderResult<DocumensoEnvelopeData> | null> {
    await this.preflight()
    const config = this.requiredConfig()
    const envelope = await this.reconcileExternalId(idempotencyKey)
    return envelope ? this.result(envelope, config.templateId) : null
  }

  private async reconcileExternalId(externalId: string): Promise<DocumensoEnvelope | null> {
    const config = this.requiredConfig()
    const response = await providerJson<unknown>(
      new URL(this.codec.reconciliationPath(externalId), ensureTrailingSlash(config.baseUrl)).toString(),
      { method: 'GET', headers: documensoHeaders(config.apiKey) },
    )
    const envelope = this.codec.decodeReconciledEnvelope(response)
    if (envelope) this.assertMatchingExternalId(envelope, externalId)
    return envelope
  }

  private assertMatchingExternalId(envelope: DocumensoEnvelope, externalId: string): void {
    if (!envelope.envelopeId || !envelope.status || envelope.externalId !== externalId) {
      throw new Error('Documenso response could not be matched to the requested externalId')
    }
  }

  private result(envelope: DocumensoEnvelope, templateId: string): ProviderResult<DocumensoEnvelopeData> {
    const externalId = sanitizedExternalId(this.provider, envelope.envelopeId)
    const data: DocumensoEnvelopeData = {
      ...envelope,
      templateId,
      signingOrder: ['owner', 'buyer'],
    }
    return {
      provider: this.provider,
      externalId,
      live: true,
      status: envelope.status,
      data,
      redacted: {
        externalId,
        status: envelope.status,
        templateId,
        signingOrder: data.signingOrder,
      },
    }
  }

  private requiredConfig(): Record<'baseUrl' | 'apiKey' | 'templateId', string> {
    return requireConfig(this.provider, {
      baseUrl: this.config.baseUrl,
      apiKey: this.config.apiKey,
      templateId: this.config.templateId,
    }) as Record<'baseUrl' | 'apiKey' | 'templateId', string>
  }
}

function documensoHeaders(apiKey: string, idempotencyKey?: string): Record<string, string> {
  return {
    authorization: apiKey,
    'content-type': 'application/json',
    ...(idempotencyKey ? { 'idempotency-key': idempotencyKey } : {}),
  }
}

function ensureTrailingSlash(url: string): string {
  return url.endsWith('/') ? url : `${url}/`
}
