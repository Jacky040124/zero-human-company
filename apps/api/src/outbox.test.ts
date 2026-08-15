import { describe, expect, it } from 'vitest'
import { ProviderOutcomeUnknownError } from './providers/types.js'

describe('uncertain provider outcomes', () => {
  it('carry a reconciliation hint instead of inviting a blind resend', () => {
    const error = new ProviderOutcomeUnknownError('timed out after provider accepted request', 'remote-123')
    expect(error.name).toBe('ProviderOutcomeUnknownError')
    expect(error.externalHint).toBe('remote-123')
  })
})
