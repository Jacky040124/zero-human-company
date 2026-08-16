import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  getConfig: vi.fn(),
}))

vi.mock('../config.js', () => ({ getConfig: mocks.getConfig }))

import { generateOutreachDraft } from './outreach-draft.js'

describe('outreach draft generation', () => {
  beforeEach(() => {
    mocks.getConfig.mockReset()
    vi.unstubAllGlobals()
  })

  it('asks gpt-4o-mini for a first email and parses JSON', async () => {
    mocks.getConfig.mockReturnValue({
      OPENROUTER_API_KEY: 'or-key',
      OPENROUTER_BASE_URL: 'https://openrouter.ai/api/v1',
      OPENROUTER_EXTRACT_MODEL: 'openai/gpt-4o-mini',
    })
    const draft = {
      contactName: 'Vitra',
      contactEmail: 'sourcing@vitra.com',
      subject: 'FSC Mix sofas from Foshan for Vitra',
      body: 'Hello,\n\nI am writing from Lead Factory for Hengxin Home in Foshan. We make FSC Mix sofas and hotel casegoods for EU importers, 1x40HQ, 35-day lead. Happy to send a spec pack if Vitra is still booking this season.\n\nLead Factory',
    }
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ choices: [{ message: { content: JSON.stringify(draft) } }] }),
    }))

    await expect(generateOutreachDraft({ company: 'Vitra', country: 'Switzerland' })).resolves.toEqual(draft)
  })

  it('falls back without saying Research only when the model is unavailable', async () => {
    mocks.getConfig.mockReturnValue({ OPENROUTER_API_KEY: undefined, OPENROUTER_BASE_URL: 'https://openrouter.ai/api/v1' })
    const draft = await generateOutreachDraft({ company: 'IKEA', buyer: 'Research only' })
    expect(draft.body).not.toMatch(/Research only/i)
    expect(draft.contactName).not.toMatch(/Research only/i)
    expect(draft.subject).toContain('IKEA')
    expect(draft.body).not.toMatch(/\[Your Name\]|Your Name/i)
    expect(draft.contactName).toBe('IKEA')
  })

  it('strips leftover name placeholders from a model draft', async () => {
    mocks.getConfig.mockReturnValue({
      OPENROUTER_API_KEY: 'or-key',
      OPENROUTER_BASE_URL: 'https://openrouter.ai/api/v1',
      OPENROUTER_EXTRACT_MODEL: 'openai/gpt-4o-mini',
    })
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [{
          message: {
            content: JSON.stringify({
              contactName: 'IKEA',
              contactEmail: 'sourcing@ikea.com',
              subject: 'FSC sofas from Foshan',
              body: 'Hello,\n\nWe can send a spec pack this week if IKEA is still booking furniture from China this season and wants FSC Mix sofas.\n\nBest regards,\n[Your Name]',
            }),
          },
        }],
      }),
    }))
    const draft = await generateOutreachDraft({ company: 'IKEA' })
    expect(draft.body).not.toMatch(/\[Your Name\]|Your Name/i)
    expect(draft.body).toContain('Lead Factory')
  })
})
