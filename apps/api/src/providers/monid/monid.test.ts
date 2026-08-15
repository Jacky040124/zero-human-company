import { describe, expect, it, vi } from 'vitest'
import { FakeMonidDiscoveryProvider, MonidDiscoveryProvider, normalizeMonidCompany } from './index.js'

describe('Monid discovery', () => {
  it('normalizes a company as research-only while retaining the external ID', () => {
    const company = normalizeMonidCompany({
      companyId: 42,
      name: '  Acme Labs  ',
      url: 'https://acme.example',
      country: 'US',
      extraSignal: 'retained',
      contacts: [{ email: 'not-returned@example.com' }],
    })

    expect(company).toEqual({
      externalCompanyId: '42',
      name: 'Acme Labs',
      website: 'https://acme.example',
      country: 'US',
      description: null,
      researchOnly: true,
      source: expect.objectContaining({ extraSignal: 'retained' }),
    })
    expect(company).not.toHaveProperty('contacts')
    expect(company.source).not.toHaveProperty('contacts')
  })

  it('uses an explicitly configured live endpoint and only sends a discovery query', async () => {
    const transport = vi.fn().mockResolvedValue({
      runId: 'run-7',
      companies: [{ id: 'company-9', name: 'Nine' }],
    })
    const provider = new MonidDiscoveryProvider(
      { baseUrl: 'https://monid.example', apiKey: 'secret' },
      transport,
    )

    const result = await provider.execute({
      demoRunId: 'demo-1',
      idempotencyKey: 'idem-1',
      payload: { query: 'battery recycling', maxResults: 3 },
    })

    expect(result.data.externalRunId).toBe('run-7')
    expect(result.data.companies[0]?.externalCompanyId).toBe('company-9')
    const body = JSON.parse(String(transport.mock.calls[0]?.[1]?.body))
    expect(body).toEqual({ query: 'battery recycling', maxResults: 3, mode: 'research_only' })
    expect(body).not.toHaveProperty('contacts')
  })

  it('provides deterministic rehearsal results', async () => {
    const provider = new FakeMonidDiscoveryProvider()
    const request = {
      demoRunId: 'demo-1',
      idempotencyKey: 'same-key',
      payload: { query: 'Acme Labs' },
    }
    expect(await provider.execute(request)).toEqual(await provider.execute(request))
  })
})
