import { describe, expect, it } from 'vitest'
import { leadStatusLabel } from './leads'

describe('leadStatusLabel', () => {
  it('keeps paused and lost runtime stages visible instead of collapsing them', () => {
    expect(leadStatusLabel({ status: 'contacted', runtimeStage: 'PAUSED' })).toBe(
      'Paused · policy',
    )
    expect(leadStatusLabel({ status: 'contacted', runtimeStage: 'LOST' })).toBe(
      'Lost / opted out',
    )
  })

  it('uses the visual pipeline label for ordinary and local leads', () => {
    expect(leadStatusLabel({ status: 'negotiating' })).toBe('Negotiating')
  })
})
