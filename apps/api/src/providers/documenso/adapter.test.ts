import { afterEach, describe, expect, it, vi } from 'vitest'
import { DocumensoProvider } from './adapter.js'
import type { DocumensoV2Codec } from './codec.js'
import { ProviderOutcomeUnknownError } from '../types.js'

function codecWithPaths(createPath: () => string, reconcilePath: (externalId: string) => string): DocumensoV2Codec {
  return {
    createEnvelopePath: createPath,
    reconciliationPath: reconcilePath,
    encodeCreateEnvelope: (input) => input,
    decodeCreatedEnvelope: () => ({ envelopeId: 'envelope-1', externalId: 'idem-1', status: 'PENDING' }),
    decodeReconciledEnvelope: () => null,
  }
}

const request = {
  demoRunId: 'demo-1',
  idempotencyKey: 'idem-1',
  payload: {
    owner: { name: 'Owner', identityRole: 'owner' as const },
    buyer: { name: 'Buyer', identityRole: 'buyer' as const, consentedAt: '2026-08-15T10:00:00.000Z' },
  },
}

const config = {
  baseUrl: 'https://api.documenso.example',
  apiKey: 'secret',
  templateId: 'template-1',
  ownerEmail: 'owner@example.com',
  buyerEmail: 'buyer@example.com',
}

afterEach(() => vi.unstubAllGlobals())

describe('Documenso provider URL boundaries', () => {
  it('keeps leading-slash codec paths under the configured API base path', async () => {
    const fetch = vi.fn(async () => new Response(JSON.stringify({ found: false }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    }))
    vi.stubGlobal('fetch', fetch)
    const provider = new DocumensoProvider(
      { ...config, baseUrl: 'https://app.documenso.com/api/v2' },
      codecWithPaths(() => '/envelope/use', (id) => `/envelope?externalId=${id}`),
    )

    await provider.execute(request)

    expect(fetch.mock.calls[0]?.[0]).toBe('https://app.documenso.com/api/v2/envelope?externalId=idem-1')
    expect(fetch.mock.calls[1]?.[0]).toBe('https://app.documenso.com/api/v2/envelope/use')
  })

  it('requires an HTTPS base URL during preflight', async () => {
    const provider = new DocumensoProvider(
      { ...config, baseUrl: 'http://api.documenso.example' },
      codecWithPaths(() => '/envelopes', (id) => `/envelopes/${id}`),
    )

    await expect(provider.preflight()).rejects.toThrow('baseUrl (must use https)')
  })

  it('rejects cross-origin create and reconciliation paths before making a request', async () => {
    const fetch = vi.fn()
    vi.stubGlobal('fetch', fetch)
    const createProvider = new DocumensoProvider(
      config,
      codecWithPaths(() => 'https://attacker.example/envelopes', (id) => `/envelopes/${id}`),
    )
    const reconcileProvider = new DocumensoProvider(
      config,
      codecWithPaths(() => '/envelopes', () => '//attacker.example/envelopes/idem-1'),
    )

    await expect(createProvider.preflight()).rejects.toThrow('must remain on the baseUrl origin')
    await expect(reconcileProvider.preflight()).rejects.toThrow('must remain on the baseUrl origin')
    expect(fetch).not.toHaveBeenCalled()
  })

  it('revalidates a dynamic path before sending credentials at runtime', async () => {
    let reconciliationCalls = 0
    const fetch = vi.fn()
    vi.stubGlobal('fetch', fetch)
    const provider = new DocumensoProvider(
      config,
      codecWithPaths(
        () => '/envelopes',
        () => ++reconciliationCalls === 1 ? '/envelopes/preflight' : 'https://attacker.example/envelopes/idem-1',
      ),
    )

    await expect(provider.execute(request)).rejects.toThrow('must remain on the baseUrl origin')
    expect(fetch).not.toHaveBeenCalled()
  })

  it('fails closed when the create path changes origin after preflight', async () => {
    let createCalls = 0
    const fetch = vi.fn(async () => new Response('{}', {
      status: 200,
      headers: { 'content-type': 'application/json' },
    }))
    vi.stubGlobal('fetch', fetch)
    const provider = new DocumensoProvider(
      config,
      codecWithPaths(
        () => ++createCalls === 1 ? '/envelopes' : 'https://attacker.example/envelopes',
        (id) => `/envelopes/${id}`,
      ),
    )

    await expect(provider.execute(request)).rejects.toThrow('must remain on the baseUrl origin')
    expect(fetch).toHaveBeenCalledTimes(1)
    expect(fetch.mock.calls[0]?.[0]).toBe('https://api.documenso.example/envelopes/idem-1')
    expect(fetch.mock.calls[0]?.[1]).toMatchObject({ method: 'GET' })
  })

  it('resolves configured signer emails only when executing the email-free request', async () => {
    const bodies: unknown[] = []
    const fetch = vi.fn(async (_input: string | URL | Request, init?: RequestInit) => {
      if (init?.method === 'GET') {
        return new Response(JSON.stringify({ found: false }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        })
      }
      bodies.push(JSON.parse(String(init?.body)))
      return new Response(JSON.stringify({}), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })
    })
    vi.stubGlobal('fetch', fetch)
    const codec = codecWithPaths(() => '/envelopes', (id) => `/envelopes/${id}`)
    const provider = new DocumensoProvider(config, codec)

    expect(JSON.stringify(request.payload)).not.toMatch(/owner@example\.com|buyer@example\.com/)
    await provider.execute(request)

    expect(bodies).toEqual([expect.objectContaining({
      recipients: [
        expect.objectContaining({ name: 'Owner', email: 'owner@example.com', signingOrder: 1, participant: 'owner' }),
        expect.objectContaining({ name: 'Buyer', email: 'buyer@example.com', signingOrder: 2, participant: 'buyer' }),
      ],
    })])
  })

  it('reconciles a lost accepted create without sending a second POST', async () => {
    let reconciliationCalls = 0
    const fetch = vi.fn(async (_input: string | URL | Request, init?: RequestInit) => {
      if (init?.method === 'POST') {
        throw new Error('response lost after provider accepted the envelope')
      }
      reconciliationCalls += 1
      return new Response(JSON.stringify(reconciliationCalls < 3
        ? { found: false }
        : { envelopeId: 'envelope-1', externalId: 'idem-1', status: 'PENDING' }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })
    })
    vi.stubGlobal('fetch', fetch)
    const codec: DocumensoV2Codec = {
      ...codecWithPaths(() => '/envelopes', (id) => `/envelopes/${id}`),
      decodeReconciledEnvelope: (response) => {
        const envelope = response as { envelopeId?: string; externalId?: string; status?: string }
        return envelope.envelopeId && envelope.externalId && envelope.status
          ? { envelopeId: envelope.envelopeId, externalId: envelope.externalId, status: envelope.status }
          : null
      },
    }
    const provider = new DocumensoProvider(config, codec)

    await expect(provider.execute(request)).rejects.toMatchObject({
      name: 'ProviderOutcomeUnknownError',
      externalHint: 'idem-1',
    } satisfies Partial<ProviderOutcomeUnknownError>)
    const reconciled = await provider.reconcile(request.idempotencyKey)

    expect(reconciled).toMatchObject({
      externalId: 'documenso:envelope-1',
      status: 'PENDING',
      data: { externalId: 'idem-1', signingOrder: ['owner', 'buyer'] },
    })
    expect(fetch.mock.calls.filter(([, init]) => init?.method === 'POST')).toHaveLength(1)
    expect(fetch.mock.calls.filter(([, init]) => init?.method === 'GET')).toHaveLength(3)
  })
})
