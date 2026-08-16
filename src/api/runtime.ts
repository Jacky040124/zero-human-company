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

export type CatalogExtractField = {
  text: string
  confidence: number
}

export type CatalogExtractRecord = {
  id: string
  partNumber: string | null
  productName: string | null
  material: string | null
  finish: string | null
  threadSpec: string | null
  specs: string[] | null
  confidence: number
  fields: Record<string, CatalogExtractField | null>
}

export type CatalogExtractResponse = {
  records: CatalogExtractRecord[]
  chunkCount: number
  live: true
  elapsedMs?: number
}

export type CatalogExtractChunk = {
  index: number
  chunkCount: number
  records: CatalogExtractRecord[]
}

export type ExtractCatalogBody = {
  text?: string
  pdfBase64?: string
  filename?: string
  threshold?: number
}

export type BuyerSearchCompany = {
  externalCompanyId: string
  name: string
  website: string | null
  country: string | null
  description: string | null
  researchOnly: true
}

export type BuyerSearchResponse = {
  live: boolean
  persisted: boolean
  demoRunId: string | null
  added: number
  query: string
  companies: BuyerSearchCompany[]
  snapshot?: DemoRunSnapshot
}

export type BuyerSearchBody = {
  query?: string
  region?: string
  buyerType?: string
  maxResults?: number
}

export type OutreachDraft = {
  contactName: string
  contactEmail: string
  subject: string
  body: string
}

export type OutreachDraftBody = {
  company: string
  country?: string
  description?: string
  buyer?: string
  focus?: string
}

export type ExtractCatalogHandlers = {
  onStart?: (chunkCount: number) => void
  onChunk?: (chunk: CatalogExtractChunk) => void
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

function isNullableString(value: unknown): value is string | null {
  return value === null || typeof value === 'string'
}

function isExtractField(value: unknown): value is CatalogExtractField {
  return (
    !!value
    && typeof value === 'object'
    && typeof (value as CatalogExtractField).text === 'string'
    && typeof (value as CatalogExtractField).confidence === 'number'
  )
}

function parseCatalogExtractRecord(value: unknown): CatalogExtractRecord {
  if (!value || typeof value !== 'object') throw new Error('Catalog extract response was invalid')
  const record = value as Record<string, unknown>
  if (typeof record.id !== 'string' || typeof record.confidence !== 'number') {
    throw new Error('Catalog extract response was invalid')
  }
  if (
    !isNullableString(record.partNumber)
    || !isNullableString(record.productName)
    || !isNullableString(record.material)
    || !isNullableString(record.finish)
    || !isNullableString(record.threadSpec)
  ) {
    throw new Error('Catalog extract response was invalid')
  }
  if (record.specs !== null && (!Array.isArray(record.specs) || !record.specs.every((item) => typeof item === 'string'))) {
    throw new Error('Catalog extract response was invalid')
  }
  if (!record.fields || typeof record.fields !== 'object' || Array.isArray(record.fields)) {
    throw new Error('Catalog extract response was invalid')
  }
  const fields: Record<string, CatalogExtractField | null> = {}
  for (const [key, field] of Object.entries(record.fields as Record<string, unknown>)) {
    if (field === null) {
      fields[key] = null
      continue
    }
    if (!isExtractField(field)) throw new Error('Catalog extract response was invalid')
    fields[key] = field
  }
  return {
    id: record.id,
    partNumber: record.partNumber,
    productName: record.productName,
    material: record.material,
    finish: record.finish,
    threadSpec: record.threadSpec,
    specs: record.specs as string[] | null,
    confidence: record.confidence,
    fields,
  }
}

function parseCatalogExtract(value: unknown): CatalogExtractResponse {
  if (!value || typeof value !== 'object') throw new Error('Catalog extract response was invalid')
  const body = value as Record<string, unknown>
  if (body.live !== true || typeof body.chunkCount !== 'number' || !Array.isArray(body.records)) {
    throw new Error('Catalog extract response was invalid')
  }
  return {
    records: body.records.map(parseCatalogExtractRecord),
    chunkCount: body.chunkCount,
    live: true,
    elapsedMs: typeof body.elapsedMs === 'number' ? body.elapsedMs : undefined,
  }
}

function parseCatalogChunk(value: unknown): CatalogExtractChunk {
  if (!value || typeof value !== 'object') throw new Error('Catalog extract chunk was invalid')
  const body = value as Record<string, unknown>
  if (typeof body.index !== 'number' || typeof body.chunkCount !== 'number' || !Array.isArray(body.records)) {
    throw new Error('Catalog extract chunk was invalid')
  }
  return {
    index: body.index,
    chunkCount: body.chunkCount,
    records: body.records.map(parseCatalogExtractRecord),
  }
}

async function readSseExtract(
  response: Response,
  handlers: ExtractCatalogHandlers = {},
): Promise<CatalogExtractResponse> {
  if (!response.body) throw new Error('Catalog extract stream was empty')
  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  let doneResult: CatalogExtractResponse | undefined
  let streamError: string | undefined

  const consumeBlock = (block: string) => {
    const event = /(?:^|\n)event: ([^\n]+)/.exec(block)?.[1]?.trim()
    const dataLines = block
      .split('\n')
      .filter((line) => line.startsWith('data:'))
      .map((line) => line.slice(5).trimStart())
    if (!event || dataLines.length === 0) return
    const data: unknown = JSON.parse(dataLines.join('\n'))
    if (event === 'start') {
      const chunkCount = data && typeof data === 'object' && typeof (data as { chunkCount?: unknown }).chunkCount === 'number'
        ? (data as { chunkCount: number }).chunkCount
        : 0
      handlers.onStart?.(chunkCount)
      return
    }
    if (event === 'chunk') {
      handlers.onChunk?.(parseCatalogChunk(data))
      return
    }
    if (event === 'done') {
      doneResult = parseCatalogExtract(data)
      return
    }
    if (event === 'error') {
      streamError = data && typeof data === 'object' && typeof (data as { error?: unknown }).error === 'string'
        ? (data as { error: string }).error
        : 'Could not extract the catalog'
    }
  }

  while (true) {
    const { value, done } = await reader.read()
    buffer += decoder.decode(value ?? new Uint8Array(), { stream: !done })
    const parts = buffer.split('\n\n')
    buffer = parts.pop() ?? ''
    for (const part of parts) consumeBlock(part)
    if (done) {
      if (buffer.trim()) consumeBlock(buffer)
      break
    }
  }

  if (streamError) throw new Error(streamError)
  if (!doneResult) throw new Error('Catalog extract stream ended without a result')
  return doneResult
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

function parseBuyerSearch(value: unknown): BuyerSearchResponse {
  if (!value || typeof value !== 'object') throw new Error('Buyer search response was invalid')
  const body = value as Record<string, unknown>
  const live = body.live
  const persisted = body.persisted
  const added = body.added
  const query = typeof body.query === 'string' ? body.query : null
  const demoRunId = typeof body.demoRunId === 'string' ? body.demoRunId : body.demoRunId === null ? null : undefined
  const rawCompanies = Array.isArray(body.companies) ? body.companies : null
  if (typeof live !== 'boolean' || typeof persisted !== 'boolean' || typeof added !== 'number') {
    throw new Error('Buyer search response was invalid')
  }
  if (query === null || rawCompanies === null || demoRunId === undefined) {
    throw new Error('Buyer search response was invalid')
  }
  const companies: BuyerSearchCompany[] = []
  for (const item of rawCompanies) {
    if (!item || typeof item !== 'object') throw new Error('Buyer search response was invalid')
    const company = item as Record<string, unknown>
    if (
      typeof company.externalCompanyId !== 'string'
      || typeof company.name !== 'string'
      || company.researchOnly !== true
      || !isNullableString(company.website)
      || !isNullableString(company.country)
      || !isNullableString(company.description)
    ) {
      throw new Error('Buyer search response was invalid')
    }
    companies.push({
      externalCompanyId: company.externalCompanyId,
      name: company.name,
      website: company.website,
      country: company.country,
      description: company.description,
      researchOnly: true,
    })
  }
  return {
    live,
    persisted,
    demoRunId,
    added,
    query,
    companies,
    snapshot: body.snapshot === undefined ? undefined : demoRunSnapshotSchema.parse(body.snapshot),
  }
}

function parseOutreachDraft(value: unknown): OutreachDraft {
  if (!value || typeof value !== 'object') throw new Error('Outreach draft was invalid')
  const body = value as Record<string, unknown>
  if (
    typeof body.contactName !== 'string'
    || typeof body.contactEmail !== 'string'
    || typeof body.subject !== 'string'
    || typeof body.body !== 'string'
  ) {
    throw new Error('Outreach draft was invalid')
  }
  return {
    contactName: body.contactName,
    contactEmail: body.contactEmail,
    subject: body.subject,
    body: body.body,
  }
}

export type AppUser = {
  id: string
  email: string
  name: string
}

export async function requestMagicLink(email: string): Promise<{ email: string; link: string }> {
  const response = await request('/api/v1/auth/magic-link', {
    method: 'POST',
    body: JSON.stringify({ email }),
  })
  if (!response.ok) throw await responseError(response, 'Could not create the sign-in link')
  const body = await response.json() as Record<string, unknown>
  if (typeof body.email !== 'string' || typeof body.link !== 'string') {
    throw new Error('Magic link response was invalid')
  }
  return { email: body.email, link: body.link }
}

export async function getMe(): Promise<AppUser | null> {
  const response = await request('/api/v1/auth/me')
  if (response.status === 401) return null
  if (!response.ok) throw await responseError(response, 'Could not load the profile')
  const body = await response.json() as { user?: AppUser }
  if (!body.user || typeof body.user.email !== 'string') throw new Error('Profile response was invalid')
  return body.user
}

export async function signOut(): Promise<void> {
  const response = await request('/api/v1/auth/signout', { method: 'POST' })
  if (!response.ok) throw await responseError(response, 'Sign-out failed')
}

export async function draftOutreach(body: OutreachDraftBody): Promise<OutreachDraft> {
  const response = await request('/api/v1/outreach/draft', {
    method: 'POST',
    body: JSON.stringify(body),
  })
  if (!response.ok) throw await responseError(response, 'Could not draft the email')
  return parseOutreachDraft(await response.json())
}

export async function searchBuyers(body: BuyerSearchBody = {}): Promise<BuyerSearchResponse> {
  const response = await request('/api/v1/discovery/search', {
    method: 'POST',
    body: JSON.stringify(body),
  })
  if (!response.ok) {
    if (response.status === 401) throw new Error('OWNER_AUTH_REQUIRED')
    throw await responseError(response, 'Could not search Apollo buyers')
  }
  return parseBuyerSearch(await response.json())
}

export async function extractCatalog(
  body: ExtractCatalogBody,
  handlers: ExtractCatalogHandlers = {},
): Promise<CatalogExtractResponse> {
  const response = await request('/api/v1/catalog/extract', {
    method: 'POST',
    body: JSON.stringify(body),
  })
  if (!response.ok) throw await responseError(response, 'Could not extract the catalog')
  const contentType = response.headers.get('content-type') ?? ''
  if (contentType.includes('text/event-stream')) {
    return readSseExtract(response, handlers)
  }
  return parseCatalogExtract(await response.json())
}
