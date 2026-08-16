import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  getConfig: vi.fn(),
}))

vi.mock('../config.js', () => ({ getConfig: mocks.getConfig }))

import { cleanKeywordQuery, generateBuyerSearchQuery, pickSearchAngle } from './buyer-search-query.js'

describe('buyer search query generation', () => {
  beforeEach(() => {
    mocks.getConfig.mockReset()
    vi.unstubAllGlobals()
  })

  it('rotates fallback angles', () => {
    expect(pickSearchAngle(() => 0)).not.toEqual(pickSearchAngle(() => 0.99))
  })

  it('rejects boolean syntax and long sentences that break Apollo keyword tags', () => {
    expect(cleanKeywordQuery('importer AND hospitality AND FF&E')).toBeNull()
    expect(cleanKeywordQuery('NOT (IKEA OR Zara)')).toBeNull()
    expect(cleanKeywordQuery('employee_count:<2000')).toBeNull()
    expect(cleanKeywordQuery('Nordic importers seeking FSC certified upholstered sofas')).toBeNull()
    expect(cleanKeywordQuery(' "Furniture Wholesale" ')).toBe('furniture wholesale')
  })

  it('asks the model for a short tag and keeps it', async () => {
    mocks.getConfig.mockReturnValue({
      OPENROUTER_API_KEY: 'or-key',
      OPENROUTER_BASE_URL: 'https://openrouter.ai/api/v1',
      OPENROUTER_EXTRACT_MODEL: 'openai/gpt-4o-mini',
    })
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ choices: [{ message: { content: 'casegoods distributor' } }] }),
    }))
    await expect(generateBuyerSearchQuery({ region: 'Europe', buyerType: 'importer' }))
      .resolves.toBe('casegoods distributor')
  })

  it('falls back to a short angle when the model output is unusable', async () => {
    mocks.getConfig.mockReturnValue({
      OPENROUTER_API_KEY: 'or-key',
      OPENROUTER_BASE_URL: 'https://openrouter.ai/api/v1',
      OPENROUTER_EXTRACT_MODEL: 'openai/gpt-4o-mini',
    })
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ choices: [{ message: { content: 'importer AND hospitality AND NOT IKEA' } }] }),
    }))
    const query = await generateBuyerSearchQuery({ region: 'Europe' })
    expect(query.split(' ').length).toBeLessThanOrEqual(3)
    expect(query).not.toMatch(/\bAND\b/i)
  })
})
