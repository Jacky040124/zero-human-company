import {
  demoRunSnapshotSchema,
  proofItemSchema,
  type DemoRunSnapshot,
  type ProofItem,
} from '@zero-human/contracts'

export type OwnerSession = { authenticated: boolean }

export type ProofResponse = {
  demoRunId: string
  proof: ProofItem[]
}

export type VerificationReport = {
  runId: string
  passed: boolean
  checks: Array<{ name: string; passed: boolean; detail: string }>
}

async function request(path: string, init?: RequestInit): Promise<Response> {
  const headers = init?.body === undefined
    ? init?.headers
    : { 'content-type': 'application/json', ...init.headers }
  return fetch(path, {
    credentials: 'same-origin',
    ...init,
    ...(headers ? { headers } : {}),
  })
}

async function responseError(response: Response, fallback: string): Promise<Error> {
  try {
    const body = await response.clone().json() as { error?: unknown }
    if (typeof body.error === 'string' && body.error) return new Error(body.error)
  } catch {
    // The fallback remains useful when an intermediary returns HTML or an empty body.
  }
  return new Error(`${fallback} (${response.status})`)
}

function parseOwnerSession(value: unknown): OwnerSession {
  if (!value || typeof value !== 'object' || typeof (value as OwnerSession).authenticated !== 'boolean') {
    throw new Error('Owner session response was invalid')
  }
  return { authenticated: (value as OwnerSession).authenticated }
}

function parseVerificationReport(value: unknown): VerificationReport {
  if (!value || typeof value !== 'object') throw new Error('Verification response was invalid')
  const report = value as VerificationReport
  if (
    typeof report.runId !== 'string'
    || typeof report.passed !== 'boolean'
    || !Array.isArray(report.checks)
    || !report.checks.every((check) => check
      && typeof check.name === 'string'
      && typeof check.passed === 'boolean'
      && typeof check.detail === 'string')
  ) {
    throw new Error('Verification response was invalid')
  }
  return report
}

function isSafeCheckoutUrl(value: string): boolean {
  let url: URL
  try {
    url = new URL(value)
  } catch {
    return false
  }
  if (url.protocol === 'https:') return true
  return url.protocol === 'http:' && (url.hostname === 'localhost' || url.hostname === '127.0.0.1')
}

export async function getOwnerSession(): Promise<OwnerSession> {
  const response = await request('/api/v1/auth/session')
  if (!response.ok) throw await responseError(response, 'Could not inspect owner session')
  return parseOwnerSession(await response.json())
}

export async function loginOwner(email: string, password: string): Promise<OwnerSession> {
  const response = await request('/api/v1/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  })
  if (!response.ok) throw new Error(response.status === 401 ? 'Owner sign-in failed' : `Owner sign-in failed (${response.status})`)
  return parseOwnerSession(await response.json())
}

export async function logoutOwner(): Promise<OwnerSession> {
  const response = await request('/api/v1/auth/logout', { method: 'POST' })
  if (!response.ok) throw await responseError(response, 'Owner sign-out failed')
  return parseOwnerSession(await response.json())
}

export async function getActiveRun(): Promise<DemoRunSnapshot | null> {
  const response = await request('/api/v1/demo-runs/active')
  if (response.status === 404) return null
  if (!response.ok) throw await responseError(response, 'Could not load the active run')
  return demoRunSnapshotSchema.parse(await response.json())
}

export async function getRun(runId: string): Promise<DemoRunSnapshot> {
  const response = await request(`/api/v1/demo-runs/${encodeURIComponent(runId)}`)
  if (!response.ok) throw await responseError(response, 'Could not load the run')
  const snapshot = demoRunSnapshotSchema.parse(await response.json())
  if (snapshot.id !== runId) throw new Error('Run response did not match the requested run')
  return snapshot
}

export async function getRunProof(runId: string): Promise<ProofResponse> {
  const response = await request(`/api/v1/demo-runs/${encodeURIComponent(runId)}/proof`)
  if (!response.ok) throw await responseError(response, 'Could not load run proof')
  const value = await response.json() as { demoRunId?: unknown; proof?: unknown }
  if (value.demoRunId !== runId) throw new Error('Proof response did not match the requested run')
  return { demoRunId: value.demoRunId, proof: proofItemSchema.array().parse(value.proof) }
}

export async function verifyRun(runId: string): Promise<VerificationReport> {
  const response = await request(`/api/v1/demo-runs/${encodeURIComponent(runId)}/verify`)
  if (!response.ok) throw await responseError(response, 'Could not verify the run')
  const report = parseVerificationReport(await response.json())
  if (report.runId !== runId) throw new Error('Verification response did not match the requested run')
  return report
}

export function subscribeToRun(
  runId: string,
  onSnapshot: (snapshot: DemoRunSnapshot) => void,
  onError: () => void,
): () => void {
  const source = new EventSource(`/api/v1/demo-runs/${encodeURIComponent(runId)}/events`)
  source.addEventListener('snapshot', (event) => {
    try {
      const parsed = demoRunSnapshotSchema.safeParse(JSON.parse((event as MessageEvent).data))
      if (parsed.success) onSnapshot(parsed.data)
      else onError()
    } catch {
      onError()
    }
  })
  source.onerror = onError
  return () => source.close()
}

export async function activatePilot(runId: string): Promise<string> {
  const response = await request(`/api/v1/demo-runs/${encodeURIComponent(runId)}/activate`, { method: 'POST' })
  if (!response.ok) {
    if (response.status === 401) throw new Error('OWNER_AUTH_REQUIRED')
    throw await responseError(response, 'Could not create the Stripe TEST checkout')
  }
  const body = await response.json() as { checkoutUrl?: unknown }
  if (typeof body.checkoutUrl !== 'string' || !isSafeCheckoutUrl(body.checkoutUrl)) {
    throw new Error('Stripe TEST checkout response was invalid')
  }
  return body.checkoutUrl
}

export async function decideCampaign(runId: string, decision: 'APPROVE' | 'REJECT'): Promise<DemoRunSnapshot> {
  const response = await request(`/api/v1/demo-runs/${encodeURIComponent(runId)}/campaign-decision`, {
    method: 'POST',
    body: JSON.stringify({ decision }),
  })
  if (!response.ok) {
    if (response.status === 401) throw new Error('OWNER_AUTH_REQUIRED')
    throw await responseError(response, 'Campaign decision failed')
  }
  return demoRunSnapshotSchema.parse(await response.json())
}
