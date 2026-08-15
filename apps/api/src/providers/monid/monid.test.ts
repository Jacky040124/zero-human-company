import { describe, expect, it, vi } from 'vitest'
import { ProviderOutcomeUnknownError } from '../types.js'
import { FakeMonidDiscoveryProvider, MonidDiscoveryProvider, normalizeMonidCompany } from './index.js'

const discover = {
  results: [
    { provider: 'other', endpoint: '/companies', description: 'Not allowlisted' },
    { provider: 'apollo', endpoint: '/mixed_companies/search', description: 'Search organizations' },
  ],
  count: 2,
}

const inspect = {
  provider: 'apollo',
  endpoint: '/mixed_companies/search',
  input: {
    queryParams: {
      type: 'object',
      properties: {
        'q_organization_keyword_tags[]': { type: 'array', items: { type: 'string' } },
        'organization_locations[]': { type: 'array', items: { type: 'string' } },
        page: { type: 'integer' },
        per_page: { type: 'integer' },
      },
    },
  },
}

const completedRun = {
  runId: 'run-7',
  provider: 'apollo',
  endpoint: '/mixed_companies/search',
  status: 'COMPLETED',
  input: {
    queryParams: {
      'q_organization_keyword_tags[]': ['European furniture importers buying upholstered sofas or dining furniture from China', 'furniture', 'importer'],
      'organization_locations[]': ['Europe'],
      page: 1,
      per_page: 8,
    },
  },
  providerResponse: { httpStatus: 200 },
  output: {
    organizations: [{
      id: 'company-9',
      name: 'Nine Furniture GmbH',
      website_url: 'https://nine.example',
      country: 'Germany',
      short_description: 'Furniture importer',
      primary_phone: { number: '+49 30 12345678' },
      contact_email: 'buyer@nine.example',
    }],
  },
}

const request = {
  demoRunId: 'demo-1',
  idempotencyKey: 'idem-1',
  payload: {
    query: 'European furniture importers buying upholstered sofas or dining furniture from China',
    maxResults: 8,
    filters: { region: 'Europe', buyerType: 'importer' },
  },
}

function providerWith(
  responses: unknown[],
  overrides: { pollIntervalMs?: number; maxPollDurationMs?: number } = {},
) {
  const transport = vi.fn(async () => responses.shift())
  const sleep = vi.fn(async () => {})
  return {
    provider: new MonidDiscoveryProvider({
      baseUrl: 'https://api.monid.example',
      apiKey: 'secret',
      pollIntervalMs: overrides.pollIntervalMs ?? 1,
      maxPollDurationMs: overrides.maxPollDurationMs ?? 3,
    }, transport, sleep),
    transport,
    sleep,
  }
}

describe('Monid discovery', () => {
  it('normalizes organizations as research-only and recursively redacts contact PII', () => {
    const company = normalizeMonidCompany({
      organization_id: 42,
      name: '  Acme Möbel  ',
      primary_domain: 'acme.example',
      country: 'DE',
      short_description: 'Furniture buyer',
      extraSignal: 'retained',
      contacts: [{ email: 'not-returned@example.com' }],
      nested: { phone_number: '+49 30 12345678', note: 'write jane@example.com' },
    })

    expect(company).toMatchObject({
      externalCompanyId: '42',
      name: 'Acme Möbel',
      website: 'https://acme.example',
      country: 'DE',
      description: 'Furniture buyer',
      researchOnly: true,
      source: { extraSignal: 'retained', nested: { note: 'write [REDACTED_EMAIL]' } },
    })
    expect(JSON.stringify(company)).not.toContain('not-returned@example.com')
    expect(JSON.stringify(company)).not.toContain('12345678')
  })

  it('discovers and inspects the allowlisted Apollo endpoint before one synchronous paid run', async () => {
    const { provider, transport } = providerWith([discover, inspect, completedRun])
    const result = await provider.execute(request)

    expect(provider.capabilities().idempotency).toBe('reconcile')
    expect(result).toMatchObject({
      externalId: 'monid:run-7',
      data: {
        externalRunId: 'run-7',
        researchOnly: true,
        companies: [{ externalCompanyId: 'company-9', researchOnly: true }],
      },
      redacted: { externalId: 'monid:run-7', researchOnly: true },
    })
    expect(transport.mock.calls.map((call) => [new URL(call[0]).pathname, call[1].method])).toEqual([
      ['/v1/discover', 'POST'],
      ['/v1/inspect', 'POST'],
      ['/v1/run', 'POST'],
    ])
    expect(JSON.parse(String(transport.mock.calls[0]?.[1]?.body))).toEqual({
      query: 'company organization search by keywords and locations', limit: 20,
    })
    expect(JSON.parse(String(transport.mock.calls[1]?.[1]?.body))).toEqual({
      provider: 'apollo', endpoint: '/mixed_companies/search',
    })
    expect(JSON.parse(String(transport.mock.calls[2]?.[1]?.body))).toEqual({
      provider: 'apollo',
      endpoint: '/mixed_companies/search',
      input: {
        queryParams: {
          'q_organization_keyword_tags[]': [request.payload.query, 'furniture', 'importer'],
          'organization_locations[]': ['Europe'],
          page: 1,
          per_page: 8,
        },
      },
    })
  })

  it('supports the documented inspect.inputSchema shape and sends direct run input', async () => {
    const officialInspect = {
      provider: 'apollo',
      endpoint: '/mixed_companies/search',
      inputSchema: {
        type: 'object',
        properties: {
          q_organization_keyword_tags: { type: 'array', items: { type: 'string' } },
          organization_locations: { type: 'array', items: { type: 'string' } },
          page: { type: 'integer' },
          per_page: { type: 'integer' },
        },
      },
    }
    const directInput = {
      q_organization_keyword_tags: [request.payload.query, 'furniture', 'importer'],
      organization_locations: ['Europe'],
      page: 1,
      per_page: 8,
    }
    const { provider, transport } = providerWith([
      discover,
      officialInspect,
      { ...completedRun, input: directInput },
    ])

    await expect(provider.execute(request)).resolves.toMatchObject({ externalId: 'monid:run-7' })
    expect(JSON.parse(String(transport.mock.calls[2]?.[1]?.body))).toEqual({
      provider: 'apollo', endpoint: '/mixed_companies/search', input: directInput,
    })
  })

  it('polls a RUNNING run within a bounded window and returns organizations', async () => {
    const running = {
      runId: 'run-7', provider: 'apollo', endpoint: '/mixed_companies/search', status: 'RUNNING',
    }
    const { provider, transport, sleep } = providerWith([
      discover,
      inspect,
      running,
      running,
      completedRun,
    ], { pollIntervalMs: 1, maxPollDurationMs: 3 })

    await expect(provider.execute(request)).resolves.toMatchObject({ externalId: 'monid:run-7' })
    expect(transport.mock.calls.slice(3).map((call) => [new URL(call[0]).pathname, call[1].method])).toEqual([
      ['/v1/runs/run-7', 'GET'],
      ['/v1/runs/run-7', 'GET'],
    ])
    expect(sleep).toHaveBeenCalledTimes(2)
  })

  it('rejects a provider HTTP failure even when the Monid lifecycle is COMPLETED', async () => {
    const { provider } = providerWith([discover, inspect, {
      runId: 'run-provider-error',
      provider: 'apollo',
      endpoint: '/mixed_companies/search',
      status: 'COMPLETED',
      providerResponse: { httpStatus: 400, error: { message: 'bad query' } },
      output: null,
    }])
    await expect(provider.execute(request)).rejects.toMatchObject({
      name: 'ProviderOutcomeUnknownError',
      externalHint: 'monid:run-provider-error',
    })
  })

  it('does not inspect or start a paid run when discovery omits the allowlisted endpoint', async () => {
    const { provider, transport } = providerWith([{ results: [{ provider: 'apollo', endpoint: '/people/search' }] }])
    await expect(provider.execute(request)).rejects.toThrow('allowlisted endpoint')
    expect(transport).toHaveBeenCalledTimes(1)
  })

  it('turns read-only discovery timeouts into ordinary safe-retry errors', async () => {
    const transport = vi.fn(async () => { throw new ProviderOutcomeUnknownError('read timeout') })
    const provider = new MonidDiscoveryProvider({ baseUrl: 'https://api.monid.example', apiKey: 'secret' }, transport)
    const error = await provider.execute(request).catch((caught: unknown) => caught)
    expect(error).toBeInstanceOf(Error)
    expect(error).not.toBeInstanceOf(ProviderOutcomeUnknownError)
    expect((error as Error).message).toContain('before any paid run began')
  })

  it('refuses to send the bearer credential over a non-HTTPS base URL', async () => {
    const transport = vi.fn()
    const provider = new MonidDiscoveryProvider({ baseUrl: 'http://api.monid.example', apiKey: 'secret' }, transport)
    await expect(provider.execute(request)).rejects.toThrow('must use https')
    expect(transport).not.toHaveBeenCalled()
  })

  it('preserves the run hint when organization normalization fails after a paid run', async () => {
    const malformed = {
      ...completedRun,
      runId: 'run-malformed-company',
      output: { organizations: [{ name: 'Missing stable ID' }] },
    }
    const { provider } = providerWith([discover, inspect, malformed])
    await expect(provider.execute(request)).rejects.toMatchObject({
      name: 'ProviderOutcomeUnknownError',
      externalHint: 'monid:run-malformed-company',
    })
  })

  it('rejects terminal results from any provider or endpoint outside the allowlist', async () => {
    const { provider } = providerWith([discover, inspect, {
      ...completedRun,
      runId: 'run-wrong-provider',
      provider: 'other',
    }])
    await expect(provider.execute(request)).rejects.toMatchObject({
      name: 'ProviderOutcomeUnknownError',
      externalHint: 'monid:run-wrong-provider',
    })
  })

  it('carries monid:<runId> when bounded polling is uncertain', async () => {
    const running = {
      runId: 'run-pending', provider: 'apollo', endpoint: '/mixed_companies/search', status: 'RUNNING',
    }
    const { provider } = providerWith([discover, inspect, running, running], {
      pollIntervalMs: 1,
      maxPollDurationMs: 1,
    })
    await expect(provider.execute(request)).rejects.toMatchObject({
      name: 'ProviderOutcomeUnknownError',
      externalHint: 'monid:run-pending',
    })
  })

  it('reconciles only by GET for a known monid:<runId> without rerunning discovery or the paid request', async () => {
    const { provider, transport } = providerWith([completedRun])
    const result = await provider.reconcile('ignored-idempotency-key', {
      ...request,
      externalHint: 'monid:run-7',
    })
    expect(result).toMatchObject({ externalId: 'monid:run-7', data: { externalRunId: 'run-7' } })
    expect(transport).toHaveBeenCalledTimes(1)
    expect(new URL(transport.mock.calls[0]?.[0] ?? '').pathname).toBe('/v1/runs/run-7')
    expect(transport.mock.calls[0]?.[1]?.method).toBe('GET')
  })

  it('validates reconciled input against the original request when Monid returns it', async () => {
    const { provider, transport } = providerWith([{
      ...completedRun,
      input: { queryParams: { ...completedRun.input.queryParams, 'organization_locations[]': ['North America'] } },
    }])
    await expect(provider.reconcile('idem', { ...request, externalHint: 'monid:run-7' })).rejects.toMatchObject({
      name: 'ProviderOutcomeUnknownError',
      externalHint: 'monid:run-7',
    })
    expect(transport).toHaveBeenCalledTimes(1)
    expect(transport.mock.calls[0]?.[1]?.method).toBe('GET')
  })

  it('does not attempt reconciliation without a stable Monid run hint', async () => {
    const { provider, transport } = providerWith([])
    await expect(provider.reconcile('idem', { ...request })).resolves.toBeNull()
    expect(transport).not.toHaveBeenCalled()
  })

  it('does not expose paid-run transport failures as safe retries', async () => {
    const transport = vi.fn()
      .mockResolvedValueOnce(discover)
      .mockResolvedValueOnce(inspect)
      .mockRejectedValueOnce(new ProviderOutcomeUnknownError('timeout'))
    const provider = new MonidDiscoveryProvider({ baseUrl: 'https://api.monid.example', apiKey: 'secret' }, transport)
    await expect(provider.execute(request)).rejects.toBeInstanceOf(ProviderOutcomeUnknownError)
    expect(transport).toHaveBeenCalledTimes(3)
  })

  it('provides deterministic rehearsal results', async () => {
    const provider = new FakeMonidDiscoveryProvider()
    const fakeRequest = {
      demoRunId: 'demo-1',
      idempotencyKey: 'same-key',
      payload: { query: 'Acme Labs' },
    }
    expect(await provider.execute(fakeRequest)).toEqual(await provider.execute(fakeRequest))
  })
})
