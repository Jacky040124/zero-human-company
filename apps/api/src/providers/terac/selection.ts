import type { TeracCompleteStudy, TeracSelection } from './types.js'

export function selectTeracWinner(study: TeracCompleteStudy): TeracSelection {
  if (study.providerSelectedWinnerId) {
    const exists = study.scores.some(({ candidateId }) => candidateId === study.providerSelectedWinnerId)
    if (!exists) throw new Error('Terac selected a winner outside the two candidates')
    return { winnerId: study.providerSelectedWinnerId, source: 'provider' }
  }

  const ranked = [...study.scores].sort((left, right) => {
    const totalDifference = total(right) - total(left)
    if (totalDifference !== 0) return totalDifference
    if (right.trust !== left.trust) return right.trust - left.trust
    if (right.clarity !== left.clarity) return right.clarity - left.clarity
    return left.candidateId.localeCompare(right.candidateId)
  })
  return { winnerId: ranked[0].candidateId, source: 'rubric' }
}

function total(scores: TeracCompleteStudy['scores'][number]): number {
  return scores.clarity + scores.trust + scores.relevance
}
