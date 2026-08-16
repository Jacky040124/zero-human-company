import { randomUUID } from 'node:crypto'
import { getConfig } from '../config.js'
import { httpError } from '../http-errors.js'
import { MonidDiscoveryProvider, type MonidCompany } from '../providers/monid/index.js'
import { generateBuyerSearchQuery } from './buyer-search-query.js'
import type { getDemoRunSnapshot } from './demo-service.js'

export type BuyerSearchCompany = {
  externalCompanyId: string
  name: string
  website: string | null
  country: string | null
  description: string | null
  researchOnly: true
}

export type BuyerSearchResult = {
  live: boolean
  persisted: boolean
  demoRunId: string | null
  added: number
  query: string
  companies: BuyerSearchCompany[]
  snapshot?: Awaited<ReturnType<typeof getDemoRunSnapshot>>
}

export type BuyerSearchInput = {
  query?: string
  region?: string
  buyerType?: string
  maxResults?: number
}

// Apollo's organization search often omits country, so requiring it filters
// out everything. A website is the minimum identity needed to contact a lead.
export function hasContactableIdentity(company: MonidCompany): boolean {
  return Boolean(company.website?.trim())
}

function publicCompany(company: MonidCompany): BuyerSearchCompany {
  return {
    externalCompanyId: company.externalCompanyId,
    name: company.name,
    website: company.website,
    country: company.country,
    description: company.description,
    researchOnly: true,
  }
}

export async function searchBuyers(input: BuyerSearchInput = {}): Promise<BuyerSearchResult> {
  const config = getConfig()
  if (!config.MONID_API_KEY || !config.MONID_API_BASE_URL) {
    throw httpError(503, 'MONID_API_KEY is not configured')
  }

  const region = input.region?.trim() || 'Europe'
  const buyerType = input.buyerType?.trim() || 'importer'
  const query = input.query?.trim() || await generateBuyerSearchQuery({ region, buyerType })
  const maxResults = Math.min(Math.max(input.maxResults ?? 8, 1), 25)
  const provider = new MonidDiscoveryProvider({
    baseUrl: config.MONID_API_BASE_URL,
    apiKey: config.MONID_API_KEY,
  })
  const result = await provider.searchApollo({
    demoRunId: 'interactive',
    idempotencyKey: `apollo-search:${randomUUID()}`,
    payload: {
      query,
      maxResults,
      filters: { region, buyerType },
    },
  })

  const contactable = result.data.companies.filter(hasContactableIdentity)
  const companies = contactable.map(publicCompany)
  // Interactive discovery is browse-only: the operator adds companies to the
  // pipeline one by one in the UI, so nothing is persisted here.
  return { live: result.live, persisted: false, demoRunId: null, added: 0, query, companies }
}
