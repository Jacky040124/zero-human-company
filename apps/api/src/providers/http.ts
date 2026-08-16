import { ProviderOutcomeUnknownError } from './types.js'

export async function providerJson<T>(
  url: string,
  init: RequestInit,
  timeoutMs = 20_000,
): Promise<T> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const response = await fetch(url, { ...init, signal: controller.signal })
    const body = (await response.json().catch(() => ({}))) as Record<string, unknown>
    if (!response.ok) {
      throw new Error(`Provider returned ${response.status}: ${String(body.message ?? body.error ?? 'request failed')}`)
    }
    return body as T
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw new ProviderOutcomeUnknownError(`Provider request timed out after ${timeoutMs}ms`)
    }
    throw error
  } finally {
    clearTimeout(timer)
  }
}

export function bearerHeaders(apiKey: string, idempotencyKey?: string): Record<string, string> {
  return {
    authorization: `Bearer ${apiKey}`,
    'content-type': 'application/json',
    ...(idempotencyKey ? { 'idempotency-key': idempotencyKey } : {}),
  }
}

export function xApiKeyHeaders(apiKey: string): Record<string, string> {
  return {
    'X-API-Key': apiKey,
    'content-type': 'application/json',
  }
}
