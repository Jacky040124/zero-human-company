import { describe, expect, it } from 'vitest'
import { selectTeracWinner } from './selection.js'
import { parseTeracCompleteStudy } from './types.js'

describe('selectTeracWinner', () => {
  it('prefers a valid provider-selected winner', () => {
    const study = completeStudy({ providerSelectedWinnerId: 'candidate-b' })
    expect(selectTeracWinner(study)).toEqual({ winnerId: 'candidate-b', source: 'provider' })
  })

  it('uses equal rubric weights, then trust and clarity tie breakers', () => {
    const study = completeStudy({
      scores: [
        { candidateId: 'candidate-a', clarity: 3, trust: 5, relevance: 1 },
        { candidateId: 'candidate-b', clarity: 4, trust: 4, relevance: 1 },
      ],
    })
    expect(selectTeracWinner(study).winnerId).toBe('candidate-a')

    study.scores[0].trust = 4
    study.scores[0].clarity = 5
    study.scores[0].relevance = 0
    expect(selectTeracWinner(study).winnerId).toBe('candidate-a')

    study.scores[0].clarity = 4
    study.scores[0].relevance = 1
    expect(selectTeracWinner(study).winnerId).toBe('candidate-a')
  })

  it('accepts COMPLETE results without a respondent minimum', () => {
    const parsed = parseTeracCompleteStudy(completeStudy({ respondentCount: 0 }))
    expect(parsed.respondentCount).toBe(0)
  })
})

function completeStudy(overrides: Record<string, unknown> = {}) {
  return {
    status: 'COMPLETE' as const,
    studyId: 'study-1',
    scores: [
      { candidateId: 'candidate-a', clarity: 3, trust: 3, relevance: 3 },
      { candidateId: 'candidate-b', clarity: 3, trust: 3, relevance: 3 },
    ] as [
      { candidateId: string; clarity: number; trust: number; relevance: number },
      { candidateId: string; clarity: number; trust: number; relevance: number },
    ],
    ...overrides,
  }
}
