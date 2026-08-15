import { afterEach, describe, expect, it, vi } from 'vitest'
import { TeracProvider } from './adapter.js'
import type { TeracAccountCodec } from './codec.js'

const codec: TeracAccountCodec = {
  encodeStudy: (request) => request,
  decodeStudy: () => ({
    status: 'COMPLETE',
    studyId: 'study-1',
    scores: [
      { candidateId: 'candidate-a', clarity: 4, trust: 4, relevance: 4 },
      { candidateId: 'candidate-b', clarity: 3, trust: 3, relevance: 3 },
    ],
  }),
}

const request = {
  demoRunId: 'demo-1',
  idempotencyKey: 'idem-1',
  payload: {
    baseline: { id: 'baseline', content: 'Baseline' },
    candidates: [
      { id: 'candidate-a', content: 'Candidate A' },
      { id: 'candidate-b', content: 'Candidate B' },
    ] as const,
    audience: 'Furniture buyers',
    question: 'Which is clearer?',
  },
}

afterEach(() => vi.unstubAllGlobals())

describe('Terac provider URL boundaries', () => {
  it('requires an HTTPS base URL during preflight', async () => {
    const provider = new TeracProvider({
      baseUrl: 'http://api.terac.example', apiKey: 'secret', accountStudyPath: '/studies',
    }, codec)

    await expect(provider.preflight()).rejects.toThrow('baseUrl (must use https)')
  })

  it('rejects a cross-origin study endpoint before making a request', async () => {
    const fetch = vi.fn()
    vi.stubGlobal('fetch', fetch)
    const provider = new TeracProvider({
      baseUrl: 'https://api.terac.example',
      apiKey: 'secret',
      accountStudyPath: '//attacker.example/studies',
    }, codec)

    await expect(provider.execute(request)).rejects.toThrow('must remain on the baseUrl origin')
    expect(fetch).not.toHaveBeenCalled()
  })

  it('sends credentials only to a relative endpoint on the configured HTTPS origin', async () => {
    const fetch = vi.fn(async () => new Response('{}', {
      status: 200,
      headers: { 'content-type': 'application/json' },
    }))
    vi.stubGlobal('fetch', fetch)
    const provider = new TeracProvider({
      baseUrl: 'https://api.terac.example/v1', apiKey: 'secret', accountStudyPath: 'studies',
    }, codec)

    await provider.execute(request)
    expect(fetch).toHaveBeenCalledTimes(1)
    expect(fetch.mock.calls[0]?.[0]).toBe('https://api.terac.example/v1/studies')
    expect((fetch.mock.calls[0]?.[1] as RequestInit).headers).toMatchObject({
      authorization: 'Bearer secret',
    })
  })
})
