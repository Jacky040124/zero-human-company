import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  activatePilot,
  decideCampaign,
  getActiveRun,
  getOwnerSession,
  getRun,
  getRunProof,
  loginOwner,
  logoutOwner,
  searchBuyers,
  subscribeToRun,
  verifyRun,
} from './runtime'

const snapshot = {
  id: 'run-1',
  status: 'COMPLETE',
  mode: 'JUDGE',
  workspaceName: 'Test workspace',
  pilot: { status: 'PAID', amount: 500, currency: 'usd', checkoutUrl: 'https://checkout.stripe.test/session' },
  ownerActions: { used: 2, pending: null },
  opportunities: [],
  timeline: [],
  proof: [],
  updatedAt: '2026-08-15T20:00:00.000Z',
} as const

function jsonResponse(value: unknown, status = 200): Response {
  return new Response(JSON.stringify(value), { status, headers: { 'content-type': 'application/json' } })
}

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('owner session client', () => {
  it('logs in, inspects the session, and logs out with same-origin cookies', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse({ authenticated: true }))
      .mockResolvedValueOnce(jsonResponse({ authenticated: true }))
      .mockResolvedValueOnce(jsonResponse({ authenticated: false }))
    vi.stubGlobal('fetch', fetchMock)

    await expect(loginOwner('owner@example.com', 'secret')).resolves.toEqual({ authenticated: true })
    await expect(getOwnerSession()).resolves.toEqual({ authenticated: true })
    await expect(logoutOwner()).resolves.toEqual({ authenticated: false })

    expect(fetchMock).toHaveBeenNthCalledWith(1, '/api/v1/auth/login', expect.objectContaining({
      credentials: 'same-origin',
      method: 'POST',
      body: JSON.stringify({ email: 'owner@example.com', password: 'secret' }),
    }))
    expect(fetchMock).toHaveBeenNthCalledWith(2, '/api/v1/auth/session', expect.objectContaining({ credentials: 'same-origin' }))
    expect(fetchMock).toHaveBeenNthCalledWith(3, '/api/v1/auth/logout', expect.objectContaining({ credentials: 'same-origin', method: 'POST' }))
    expect(fetchMock.mock.calls[2]?.[1]?.headers).toBeUndefined()
  })

  it('keeps the owner-auth-required signal for protected actions', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({ error: 'Owner authentication required' }, 401)))
    await expect(activatePilot('run-1')).rejects.toThrow('OWNER_AUTH_REQUIRED')
    await expect(decideCampaign('run-1', 'APPROVE')).rejects.toThrow('OWNER_AUTH_REQUIRED')
    expect((fetch as ReturnType<typeof vi.fn>).mock.calls[0]?.[1]?.headers).toBeUndefined()
  })
})

describe('run API client', () => {
  it('parses complete active, by-id, and campaign-decision snapshots through the frozen schema', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse(snapshot))
      .mockResolvedValueOnce(jsonResponse({ ...snapshot, id: 'run / one' }))
      .mockResolvedValueOnce(jsonResponse(snapshot))
    vi.stubGlobal('fetch', fetchMock)

    await expect(getActiveRun()).resolves.toEqual(snapshot)
    await expect(getRun('run / one')).resolves.toEqual({ ...snapshot, id: 'run / one' })
    await expect(decideCampaign('run / one', 'REJECT')).resolves.toEqual(snapshot)

    expect(fetchMock.mock.calls[1]?.[0]).toBe('/api/v1/demo-runs/run%20%2F%20one')
    expect(fetchMock.mock.calls[2]?.[0]).toBe('/api/v1/demo-runs/run%20%2F%20one/campaign-decision')
  })

  it('returns null only when there is no active run', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({ error: 'No demo run exists yet' }, 404)))
    await expect(getActiveRun()).resolves.toBeNull()
  })

  it('loads proof, verification, and a Stripe TEST checkout URL', async () => {
    const proof = {
      provider: 'STRIPE',
      kind: 'checkout.session.completed',
      externalId: 'evt_test_1',
      live: true,
      status: 'COMPLETED',
      occurredAt: '2026-08-15T20:00:00.000Z',
    }
    const report = { runId: 'run-1', passed: true, checks: [{ name: 'judge mode', passed: true, detail: 'mode=JUDGE' }] }
    vi.stubGlobal('fetch', vi.fn()
      .mockResolvedValueOnce(jsonResponse({ demoRunId: 'run-1', proof: [proof] }))
      .mockResolvedValueOnce(jsonResponse(report))
      .mockResolvedValueOnce(jsonResponse({ checkoutUrl: 'https://checkout.stripe.test/session' })))

    await expect(getRunProof('run-1')).resolves.toEqual({ demoRunId: 'run-1', proof: [proof] })
    await expect(verifyRun('run-1')).resolves.toEqual(report)
    await expect(activatePilot('run-1')).resolves.toBe('https://checkout.stripe.test/session')
  })

  it.each([
    'javascript:alert(1)',
    'data:text/html,malicious',
    'file:///etc/passwd',
    'blob:https://example.com/id',
    '//checkout.stripe.com/session',
    'http://example.com/session',
    'http://localhost.evil.example/session',
  ])('rejects unsafe checkout redirect %s', async (checkoutUrl) => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({ checkoutUrl })))
    await expect(activatePilot('run-1')).rejects.toThrow('Stripe TEST checkout response was invalid')
  })

  it.each([
    'https://checkout.stripe.com/c/pay/cs_test_123',
    'http://localhost:5173/app/dashboard?payment=fake',
    'http://127.0.0.1:5173/app/dashboard?payment=fake',
  ])('accepts safe checkout redirect %s', async (checkoutUrl) => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({ checkoutUrl })))
    await expect(activatePilot('run-1')).resolves.toBe(checkoutUrl)
  })

  it('rejects by-id responses whose run identity does not match the request', async () => {
    const proof = {
      provider: 'STRIPE',
      kind: 'checkout.session.completed',
      externalId: 'evt_test_1',
      live: true,
      status: 'COMPLETED',
      occurredAt: '2026-08-15T20:00:00.000Z',
    }
    const report = { runId: 'other-run', passed: true, checks: [] }
    vi.stubGlobal('fetch', vi.fn()
      .mockResolvedValueOnce(jsonResponse({ ...snapshot, id: 'other-run' }))
      .mockResolvedValueOnce(jsonResponse({ demoRunId: 'other-run', proof: [proof] }))
      .mockResolvedValueOnce(jsonResponse(report)))

    await expect(getRun('run-1')).rejects.toThrow('Run response did not match the requested run')
    await expect(getRunProof('run-1')).rejects.toThrow('Proof response did not match the requested run')
    await expect(verifyRun('run-1')).rejects.toThrow('Verification response did not match the requested run')
  })

  it('rejects incomplete snapshots instead of leaking partial state into the UI', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({ ...snapshot, proof: undefined })))
    await expect(getRun('run-1')).rejects.toThrow()
  })
})

describe('buyer search client', () => {
  it('posts an Apollo search and parses research-only companies', async () => {
    const body = {
      live: true,
      persisted: false,
      demoRunId: null,
      added: 0,
      query: 'sofas',
      companies: [{
        externalCompanyId: 'company-9',
        name: 'Nine Furniture GmbH',
        website: 'https://nine.example',
        country: 'Germany',
        description: 'Furniture importer',
        researchOnly: true,
      }],
    }
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(body))
    vi.stubGlobal('fetch', fetchMock)

    await expect(searchBuyers({ query: 'sofas', region: 'Europe', maxResults: 8 })).resolves.toEqual(body)
    expect(fetchMock).toHaveBeenCalledWith('/api/v1/discovery/search', expect.objectContaining({
      credentials: 'same-origin',
      method: 'POST',
      body: JSON.stringify({ query: 'sofas', region: 'Europe', maxResults: 8 }),
    }))
  })
})

describe('run snapshot stream', () => {
  it('accepts only complete snapshot events and closes cleanly', () => {
    let snapshotListener: ((event: MessageEvent) => void) | undefined
    const close = vi.fn()
    class EventSourceMock {
      onerror: (() => void) | null = null
      readonly url: string
      constructor(url: string) {
        this.url = url
      }
      addEventListener(name: string, listener: (event: MessageEvent) => void) {
        if (name === 'snapshot') snapshotListener = listener
      }
      close = close
    }
    vi.stubGlobal('EventSource', EventSourceMock)
    const onSnapshot = vi.fn()
    const onError = vi.fn()

    const unsubscribe = subscribeToRun('run / one', onSnapshot, onError)
    snapshotListener?.(new MessageEvent('snapshot', { data: JSON.stringify(snapshot) }))
    snapshotListener?.(new MessageEvent('snapshot', { data: JSON.stringify({ id: 'partial' }) }))
    snapshotListener?.(new MessageEvent('snapshot', { data: '{bad-json' }))
    unsubscribe()

    expect(onSnapshot).toHaveBeenCalledOnce()
    expect(onSnapshot).toHaveBeenCalledWith(snapshot)
    expect(onError).toHaveBeenCalledTimes(2)
    expect(close).toHaveBeenCalledOnce()
  })
})
