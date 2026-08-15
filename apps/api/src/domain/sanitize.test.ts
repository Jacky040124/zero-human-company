import { describe, expect, it } from 'vitest'
import { sanitizeEventSummary } from './sanitize.js'

describe('event summary sanitization', () => {
  it('removes credentials and contact PII while retaining the operational outcome', () => {
    const summary = sanitizeEventSummary(
      'Band paused the deal. jane@example.com +1 (415) 555-1212 https://private.example/x Bearer abc123 token=topsecret {"apiKey":"json-key","password":"json-password"} whsec_abcdefghijk',
    )

    expect(summary).toContain('Band paused the deal.')
    expect(summary).toContain('[EMAIL_REDACTED]')
    expect(summary).toContain('[PHONE_REDACTED]')
    expect(summary).toContain('[LINK_REDACTED]')
    for (const sensitive of ['jane@example.com', '555-1212', 'private.example', 'abc123', 'topsecret', 'json-key', 'json-password', 'whsec_abcdefghijk']) {
      expect(summary).not.toContain(sensitive)
    }
  })

  it('normalizes control characters and bounds public timeline text', () => {
    expect(sanitizeEventSummary(' useful\n\t outcome ', 20)).toBe('useful outcome')
    expect(sanitizeEventSummary('x'.repeat(50), 12)).toBe('x'.repeat(12))
  })

  it('redacts underscore and hyphen-prefixed credential tokens', () => {
    const dummyTokens = [
      'sk_dummy_abcdefghijklmnopqrstuvwxyz',
      'dummy-sk-or-v1-abcdefghijklmnopqrstuvwxyz',
      'sk-proj-abcdefghijklmnopqrstuvwxyz',
    ]

    const summary = sanitizeEventSummary(`Dummy credentials: ${dummyTokens.join(' ')}`)

    expect(summary.match(/\[REDACTED_SECRET\]/g)).toHaveLength(dummyTokens.length)
    for (const dummyToken of dummyTokens) expect(summary).not.toContain(dummyToken)
  })

  it('uses a safe placeholder when nothing displayable remains', () => {
    expect(sanitizeEventSummary('\n\t')).toBe('Event recorded with sensitive details redacted.')
  })
})
