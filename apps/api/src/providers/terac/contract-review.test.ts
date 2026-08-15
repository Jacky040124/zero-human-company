import { afterEach, describe, expect, it, vi } from 'vitest'
import { ProviderConfigurationError } from '../types.js'
import { TeracContractReviewProvider } from './contract-review.js'

const request = {
  demoRunId: 'demo-1',
  idempotencyKey: 'idem-1',
  payload: {
    jurisdiction: 'Germany' as const,
    contractText: 'Contract text',
    question: 'Which clauses need attention?',
  },
}

afterEach(() => vi.unstubAllGlobals())

describe('Terac contract-review URL boundaries', () => {
  it.each([
    ['malformed', 'not a URL', 'must be a valid HTTPS URL'],
    ['HTTP', 'http://api.terac.example', 'must use https'],
  ])('rejects a %s base URL before making a request', async (_label, baseUrl, message) => {
    const fetch = vi.fn()
    vi.stubGlobal('fetch', fetch)
    const provider = new TeracContractReviewProvider({
      baseUrl,
      apiKey: 'secret',
      path: '/contract-reviews',
    })

    await expect(provider.execute(request)).rejects.toBeInstanceOf(ProviderConfigurationError)
    await expect(provider.execute(request)).rejects.toThrow(message)
    expect(fetch).not.toHaveBeenCalled()
  })

  it.each([
    ['malformed', 'https://[', 'path (must be a valid relative or same-origin URL)'],
    ['protocol-relative', '//attacker.example/contract-reviews', 'path (must remain on the baseUrl origin)'],
    ['absolute', 'https://attacker.example/contract-reviews', 'path (must remain on the baseUrl origin)'],
  ])('rejects a %s unsafe path before making a request', async (_label, path, message) => {
    const fetch = vi.fn()
    vi.stubGlobal('fetch', fetch)
    const provider = new TeracContractReviewProvider({
      baseUrl: 'https://api.terac.example',
      apiKey: 'secret',
      path,
    })

    await expect(provider.execute(request)).rejects.toBeInstanceOf(ProviderConfigurationError)
    await expect(provider.execute(request)).rejects.toThrow(message)
    expect(fetch).not.toHaveBeenCalled()
  })

  it('revalidates configuration immediately before sending credentials', async () => {
    let pathReads = 0
    const fetch = vi.fn()
    vi.stubGlobal('fetch', fetch)
    const config = {
      baseUrl: 'https://api.terac.example',
      apiKey: 'secret',
      get path() {
        pathReads += 1
        return pathReads === 1 ? '/contract-reviews' : 'https://attacker.example/contract-reviews'
      },
    }
    const provider = new TeracContractReviewProvider(config)

    await expect(provider.execute(request)).rejects.toThrow('path (must remain on the baseUrl origin)')
    expect(fetch).not.toHaveBeenCalled()
  })

  it('preserves the contract-review result for a same-origin HTTPS endpoint', async () => {
    const fetch = vi.fn(async () => new Response(JSON.stringify({
      status: 'COMPLETE',
      taskId: 'task-1',
      issues: [{ clause: '4.2', severity: 'HIGH', finding: 'Unbounded liability' }],
      recommendedText: 'Cap liability at the contract value.',
    }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    }))
    vi.stubGlobal('fetch', fetch)
    const provider = new TeracContractReviewProvider({
      baseUrl: 'https://api.terac.example/v1',
      apiKey: 'secret',
      path: 'contract-reviews',
    })

    const result = await provider.execute(request)

    expect(fetch).toHaveBeenCalledTimes(1)
    expect(fetch.mock.calls[0]?.[0]).toBe('https://api.terac.example/v1/contract-reviews')
    expect((fetch.mock.calls[0]?.[1] as RequestInit).headers).toMatchObject({
      authorization: 'Bearer secret',
    })
    expect(result).toMatchObject({
      provider: 'TERAC',
      externalId: 'terac:task-1',
      live: true,
      status: 'COMPLETE',
      redacted: { taskId: 'task-1', status: 'COMPLETE', issueCount: 1 },
    })
  })
})
