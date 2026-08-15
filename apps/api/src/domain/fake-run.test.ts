import { describe, expect, it } from 'vitest'
import { fakeDocumentEvidenceTimestamps } from './fake-run.js'

describe('fake document evidence', () => {
  it('uses deterministic owner-first signing timestamps', () => {
    const first = fakeDocumentEvidenceTimestamps()
    const second = fakeDocumentEvidenceTimestamps()

    expect(second).toEqual(first)
    expect(first.ownerSignedAt.getTime()).toBeLessThan(first.buyerSignedAt.getTime())
    expect(first.buyerSignedAt.getTime()).toBeLessThanOrEqual(first.completedAt.getTime())
  })
})
