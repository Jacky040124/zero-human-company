import type { TeracComparativeStudyRequest, TeracCompleteStudy } from './types.js'

export type TeracCodecContext = {
  demoRunId: string
  idempotencyKey: string
  rubric: readonly ['clarity', 'trust', 'relevance']
}

/** Account-specific Terac wire mappings belong in this codec. */
export interface TeracAccountCodec {
  encodeStudy(
    request: TeracComparativeStudyRequest,
    context: TeracCodecContext,
  ): unknown
  decodeStudy(response: unknown): TeracCompleteStudy
}
