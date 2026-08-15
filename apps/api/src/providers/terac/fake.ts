import type {
  ProviderCapabilities,
  ProviderPort,
  ProviderRequest,
  ProviderResult,
} from '../types.js'
import { selectTeracWinner } from './selection.js'
import {
  assertComparativeStudyRequest,
  type TeracCandidateScores,
  type TeracComparativeStudyRequest,
  type TeracCompleteStudy,
  type TeracStudyData,
} from './types.js'

export class FakeTeracProvider implements ProviderPort<TeracComparativeStudyRequest, TeracStudyData> {
  readonly provider = 'TERAC' as const

  capabilities(): ProviderCapabilities {
    return { live: false, idempotency: 'native', operations: ['comparative-study'] }
  }

  async preflight(): Promise<void> {}

  async execute(
    request: ProviderRequest<TeracComparativeStudyRequest>,
  ): Promise<ProviderResult<TeracStudyData>> {
    assertComparativeStudyRequest(request.payload)
    const scores = request.payload.candidates.map(({ id }) => deterministicScores(id)) as [
      TeracCandidateScores,
      TeracCandidateScores,
    ]
    const study: TeracCompleteStudy = {
      status: 'COMPLETE',
      studyId: `fake_${request.idempotencyKey}`,
      scores,
      baselineScores: { ...deterministicScores(request.payload.baseline.id), clarity: 40, trust: 40, relevance: 40 },
    }
    const data = { ...study, ...selectTeracWinner(study) }
    const externalId = `fake_terac_${request.idempotencyKey}`
    return {
      provider: this.provider,
      externalId,
      live: false,
      status: 'COMPLETE',
      data,
      redacted: { externalId, status: 'COMPLETE', winnerId: data.winnerId },
    }
  }
}

function deterministicScores(candidateId: string): TeracCandidateScores {
  const hash = [...candidateId].reduce((value, char) => ((value * 31) + char.charCodeAt(0)) >>> 0, 7)
  return {
    candidateId,
    clarity: 50 + (hash % 51),
    trust: 50 + ((hash >>> 6) % 51),
    relevance: 50 + ((hash >>> 12) % 51),
  }
}
