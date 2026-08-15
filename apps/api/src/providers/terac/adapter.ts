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
    teracRequestUrl(config.baseUrl, config.accountStudyPath)
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
      teracRequestUrl(config.baseUrl, config.accountStudyPath),
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

function teracRequestUrl(baseUrlValue: string, path: string): string {
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
    throw new ProviderConfigurationError('TERAC', ['accountStudyPath (must be a valid relative or same-origin URL)'])
  }
  if (requestUrl.origin !== baseUrl.origin) {
    throw new ProviderConfigurationError('TERAC', ['accountStudyPath (must remain on the baseUrl origin)'])
  }
  return requestUrl.toString()
}
