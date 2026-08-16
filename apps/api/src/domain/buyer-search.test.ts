import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  getConfig: vi.fn(),
  latestDemoRunId: vi.fn(),
  getDemoRunSnapshot: vi.fn(),
  persistResearchCompanies: vi.fn(),
  searchApollo: vi.fn(),
  generateBuyerSearchQuery: vi.fn(),
}))

vi.mock('../config.js', () => ({ getConfig: mocks.getConfig }))
vi.mock('./demo-service.js', () => ({
  latestDemoRunId: mocks.latestDemoRunId,
  getDemoRunSnapshot: mocks.getDemoRunSnapshot,
}))
vi.mock('../workflows/tasks.js', () => ({
  persistResearchCompanies: mocks.persistResearchCompanies,
}))
vi.mock('../providers/monid/index.js', () => ({
  MonidDiscoveryProvider: class {
    searchApollo = mocks.searchApollo
  },
}))
vi.mock('../http-errors.js', () => ({
  httpError: (statusCode: number, message: string) => Object.assign(new Error(message), { statusCode }),
}))
vi.mock('./buyer-search-query.js', () => ({
  generateBuyerSearchQuery: mocks.generateBuyerSearchQuery,
}))

import { searchBuyers } from './buyer-search.js'

const company = {
  externalCompanyId: 'company-9',
  name: 'Nine Furniture GmbH',
  website: 'https://nine.example',
  country: 'Germany',
  description: 'Furniture importer',
  researchOnly: true as const,
  source: { name: 'Nine Furniture GmbH' },
}

const searchResult = {
  provider: 'MONID',
  externalId: 'monid:run-7',
  live: true,
  status: 'COMPLETE',
  data: { externalRunId: 'run-7', companies: [company], researchOnly: true as const },
  redacted: { externalId: 'monid:run-7', externalCompanyIds: ['company-9'], researchOnly: true },
}

const snapshot = {
  id: 'run-1',
  status: 'RUNNING',
  mode: 'FAKE',
  workspaceName: 'Hengxin Home',
  pilot: { status: 'PENDING', amount: 500, currency: 'usd', checkoutUrl: null },
  ownerActions: { used: 0, pending: null },
  opportunities: [],
  timeline: [],
  proof: [],
  updatedAt: '2026-08-15T20:00:00.000Z',
}

describe('interactive Apollo buyer search', () => {
  beforeEach(() => {
    mocks.getConfig.mockReset()
    mocks.latestDemoRunId.mockReset()
    mocks.getDemoRunSnapshot.mockReset()
    mocks.persistResearchCompanies.mockReset()
    mocks.searchApollo.mockReset()
    mocks.generateBuyerSearchQuery.mockReset()
    mocks.generateBuyerSearchQuery.mockResolvedValue('Nordic FSC sofa importers booking 40HQ from Foshan')
    mocks.getConfig.mockReturnValue({
      MONID_API_BASE_URL: 'https://api.monid.ai',
      MONID_API_KEY: 'secret',
    })
    mocks.searchApollo.mockResolvedValue(searchResult)
  })

  it('fails closed when Monid is not configured', async () => {
    mocks.getConfig.mockReturnValue({ MONID_API_BASE_URL: undefined, MONID_API_KEY: undefined })
    await expect(searchBuyers({ query: 'furniture importers' })).rejects.toMatchObject({
      statusCode: 503,
      message: 'MONID_API_KEY is not configured',
    })
    expect(mocks.searchApollo).not.toHaveBeenCalled()
  })

  it('returns Apollo companies without writing when no run exists', async () => {
    mocks.latestDemoRunId.mockResolvedValue(null)

    await expect(searchBuyers({ query: 'furniture importers', region: 'Europe', maxResults: 8 })).resolves.toEqual({
      live: true,
      persisted: false,
      demoRunId: null,
      added: 0,
      query: 'furniture importers',
      companies: [{
        externalCompanyId: 'company-9',
        name: 'Nine Furniture GmbH',
        website: 'https://nine.example',
        country: 'Germany',
        description: 'Furniture importer',
        researchOnly: true,
      }],
    })
    expect(mocks.persistResearchCompanies).not.toHaveBeenCalled()
    expect(mocks.searchApollo).toHaveBeenCalledWith({
      demoRunId: 'interactive',
      idempotencyKey: expect.stringMatching(/^apollo-search:/),
      payload: {
        query: 'furniture importers',
        maxResults: 8,
        filters: { region: 'Europe', buyerType: 'importer' },
      },
    })
  })

  it('stays browse-only and never persists interactive results', async () => {
    await expect(searchBuyers({})).resolves.toEqual({
      live: true,
      persisted: false,
      demoRunId: null,
      added: 0,
      query: 'Nordic FSC sofa importers booking 40HQ from Foshan',
      companies: [{
        externalCompanyId: 'company-9',
        name: 'Nine Furniture GmbH',
        website: 'https://nine.example',
        country: 'Germany',
        description: 'Furniture importer',
        researchOnly: true,
      }],
    })
    expect(mocks.persistResearchCompanies).not.toHaveBeenCalled()
    expect(mocks.generateBuyerSearchQuery).toHaveBeenCalledWith({ region: 'Europe', buyerType: 'importer' })
  })

  it('drops companies without a website', async () => {
    mocks.searchApollo.mockResolvedValue({
      ...searchResult,
      data: {
        ...searchResult.data,
        companies: [company, { ...company, externalCompanyId: 'company-10', name: 'No Site BV', website: null }],
      },
    })
    const result = await searchBuyers({ query: 'furniture importer' })
    expect(result.companies.map((item) => item.name)).toEqual(['Nine Furniture GmbH'])
  })
})
