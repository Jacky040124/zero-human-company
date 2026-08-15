export const TERAC_RUBRIC = ['clarity', 'trust', 'relevance'] as const

export type TeracRubricDimension = (typeof TERAC_RUBRIC)[number]

export type TeracCreative = {
  id: string
  content: string
}

export type TeracComparativeStudyRequest = {
  baseline: TeracCreative
  candidates: readonly [TeracCreative, TeracCreative]
  audience: string
  question: string
}

export type TeracCandidateScores = {
  candidateId: string
  clarity: number
  trust: number
  relevance: number
}

export type TeracCompleteStudy = {
  status: 'COMPLETE'
  studyId: string
  providerSelectedWinnerId?: string
  respondentCount?: number
  baselineScores?: TeracCandidateScores
  scores: readonly [TeracCandidateScores, TeracCandidateScores]
}

export type TeracSelection = {
  winnerId: string
  source: 'provider' | 'rubric'
}

export type TeracStudyData = TeracCompleteStudy & TeracSelection

export function assertComparativeStudyRequest(
  request: TeracComparativeStudyRequest,
): void {
  if (!request.baseline.id || !request.baseline.content) {
    throw new Error('Terac baseline id and content are required')
  }
  if (request.candidates.length !== 2) {
    throw new Error('Terac comparative studies require exactly two candidates')
  }
  const ids = [request.baseline.id, ...request.candidates.map(({ id }) => id)]
  if (ids.some((id) => !id) || new Set(ids).size !== ids.length) {
    throw new Error('Terac creative ids must be non-empty and unique')
  }
  if (request.candidates.some(({ content }) => !content) || !request.audience || !request.question) {
    throw new Error('Terac candidate content, audience, and question are required')
  }
}

export function parseTeracCompleteStudy(value: unknown): TeracCompleteStudy {
  if (!isRecord(value) || value.status !== 'COMPLETE' || typeof value.studyId !== 'string' || !value.studyId) {
    throw new Error('Terac response is not a COMPLETE study')
  }
  if (!Array.isArray(value.scores) || value.scores.length !== 2) {
    throw new Error('Terac COMPLETE response must contain exactly two candidate scores')
  }

  const scores = value.scores.map(parseScores) as [TeracCandidateScores, TeracCandidateScores]
  if (scores[0].candidateId === scores[1].candidateId) {
    throw new Error('Terac candidate score ids must be unique')
  }

  const respondentCount = value.respondentCount
  if (respondentCount !== undefined && (!Number.isInteger(respondentCount) || (respondentCount as number) < 0)) {
    throw new Error('Terac respondentCount must be a non-negative integer when supplied')
  }
  const selected = value.providerSelectedWinnerId
  if (selected !== undefined && (typeof selected !== 'string' || !selected)) {
    throw new Error('Terac providerSelectedWinnerId must be a non-empty string when supplied')
  }

  return {
    status: 'COMPLETE',
    studyId: value.studyId,
    scores,
    ...(value.baselineScores === undefined ? {} : { baselineScores: parseScores(value.baselineScores) }),
    ...(selected === undefined ? {} : { providerSelectedWinnerId: selected }),
    ...(respondentCount === undefined ? {} : { respondentCount: respondentCount as number }),
  }
}

function parseScores(value: unknown): TeracCandidateScores {
  if (!isRecord(value) || typeof value.candidateId !== 'string' || !value.candidateId) {
    throw new Error('Terac score is missing candidateId')
  }
  const scores = Object.fromEntries(
    TERAC_RUBRIC.map((dimension) => {
      const score = value[dimension]
      if (typeof score !== 'number' || !Number.isFinite(score)) {
        throw new Error(`Terac ${dimension} score must be finite`)
      }
      return [dimension, score]
    }),
  ) as Record<TeracRubricDimension, number>
  return { candidateId: value.candidateId, ...scores }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
