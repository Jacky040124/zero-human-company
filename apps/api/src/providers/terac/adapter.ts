import { bearerHeaders, providerJson } from '../http.js'
import {
  requireConfig,
  sanitizedExternalId,
  type ProviderCapabilities,
  type ProviderPort,
  type ProviderRequest,
  type ProviderResult,
} from '../types.js'
import type { TeracAccountCodec } from './codec.js'
import { selectTeracWinner } from './selection.js'
import {
  TERAC_RUBRIC,
  assertComparativeStudyRequest,
  parseTeracCompleteStudy,
  type TeracComparativeStudyRequest,
  type TeracStudyData,
} from './types.js'

export type TeracProviderConfig = {
  baseUrl?: string
  apiKey?: string
  /** The study path documented for this Terac account. */
  accountStudyPath?: string
}

export class TeracProvider implements ProviderPort<TeracComparativeStudyRequest, TeracStudyData> {
  readonly provider = 'TERAC' as const

  constructor(
    private readonly config: TeracProviderConfig,
    private readonly codec: TeracAccountCodec,
  ) {}

  capabilities(): ProviderCapabilities {
    return { live: true, idempotency: 'native', operations: ['comparative-study'] }
  }

  async preflight(): Promise<void> {
    const config = requireConfig(this.provider, {
      baseUrl: this.config.baseUrl,
      apiKey: this.config.apiKey,
      accountStudyPath: this.config.accountStudyPath,
    })
    new URL(config.accountStudyPath, ensureTrailingSlash(config.baseUrl))
  }

  async execute(
    request: ProviderRequest<TeracComparativeStudyRequest>,
  ): Promise<ProviderResult<TeracStudyData>> {
    await this.preflight()
    assertComparativeStudyRequest(request.payload)
    const config = requireConfig(this.provider, {
      baseUrl: this.config.baseUrl,
      apiKey: this.config.apiKey,
      accountStudyPath: this.config.accountStudyPath,
    })
    const response = await providerJson<unknown>(
      new URL(config.accountStudyPath, ensureTrailingSlash(config.baseUrl)).toString(),
      {
        method: 'POST',
        headers: bearerHeaders(config.apiKey, request.idempotencyKey),
        body: JSON.stringify(this.codec.encodeStudy(request.payload, {
          demoRunId: request.demoRunId,
          idempotencyKey: request.idempotencyKey,
          rubric: TERAC_RUBRIC,
        })),
      },
    )
    const study = parseTeracCompleteStudy(this.codec.decodeStudy(response))
    const selection = selectTeracWinner(study)
    const data: TeracStudyData = { ...study, ...selection }
    const externalId = sanitizedExternalId(this.provider, study.studyId)
    return {
      provider: this.provider,
      externalId,
      live: true,
      status: study.status,
      data,
      redacted: {
        externalId,
        status: study.status,
        winnerId: selection.winnerId,
        selectionSource: selection.source,
        ...(study.respondentCount === undefined ? {} : { respondentCount: study.respondentCount }),
      },
    }
  }
}

function ensureTrailingSlash(url: string): string {
  return url.endsWith('/') ? url : `${url}/`
}
