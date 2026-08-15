import { demoRunSnapshotSchema, type DemoRunSnapshot } from '@zero-human/contracts'

async function request(path: string, init?: RequestInit): Promise<Response> {
  return fetch(path, {
    credentials: 'same-origin',
    ...init,
    headers: { 'content-type': 'application/json', ...init?.headers },
  })
}

export async function getActiveRun(): Promise<DemoRunSnapshot | null> {
  const response = await request('/api/v1/demo-runs/active')
  if (response.status === 404) return null
  if (!response.ok) throw new Error(`Run API returned ${response.status}`)
  return demoRunSnapshotSchema.parse(await response.json())
}

export function subscribeToRun(
  runId: string,
  onSnapshot: (snapshot: DemoRunSnapshot) => void,
  onError: () => void,
): () => void {
  const source = new EventSource(`/api/v1/demo-runs/${encodeURIComponent(runId)}/events`)
  source.addEventListener('snapshot', (event) => {
    const parsed = demoRunSnapshotSchema.safeParse(JSON.parse((event as MessageEvent).data))
    if (parsed.success) onSnapshot(parsed.data)
  })
  source.onerror = onError
  return () => source.close()
}

export async function loginOwner(email: string, password: string): Promise<void> {
  const response = await request('/api/v1/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) })
  if (!response.ok) throw new Error('Owner sign-in failed')
}

export async function activatePilot(runId: string): Promise<string> {
  const response = await request(`/api/v1/demo-runs/${encodeURIComponent(runId)}/activate`, { method: 'POST' })
  if (!response.ok) throw new Error(response.status === 401 ? 'OWNER_AUTH_REQUIRED' : 'Could not create the Stripe checkout')
  const body = await response.json() as { checkoutUrl: string }
  return body.checkoutUrl
}

export async function decideCampaign(runId: string, decision: 'APPROVE' | 'REJECT'): Promise<void> {
  const response = await request(`/api/v1/demo-runs/${encodeURIComponent(runId)}/campaign-decision`, { method: 'POST', body: JSON.stringify({ decision }) })
  if (!response.ok) throw new Error(response.status === 401 ? 'OWNER_AUTH_REQUIRED' : 'Campaign decision failed')
}
