const publicMessages = new Map<number, string>([
  [400, 'Invalid request'],
  [401, 'Unauthorized'],
  [403, 'Forbidden'],
  [404, 'Not found'],
  [409, 'Conflict'],
  [413, 'Request too large'],
  [422, 'Invalid request'],
  [429, 'Too many requests'],
  [503, 'Service temporarily unavailable'],
])

export interface PublicHttpError {
  statusCode: number
  body: { error: string }
}

export function httpError(statusCode: number, internalMessage: string): Error & { statusCode: number } {
  return Object.assign(new Error(internalMessage), { statusCode })
}

/**
 * Never expose thrown provider, validation, database, or workflow messages to
 * public clients. Those messages can contain upstream payloads, contact data,
 * or credentials. Expected route responses are sent explicitly by the route;
 * this is the fail-closed boundary for uncaught errors.
 */
export function toPublicHttpError(error: unknown): PublicHttpError {
  const metadata = typeof error === 'object' && error !== null
    ? error as { statusCode?: unknown; code?: unknown; name?: unknown }
    : undefined
  const inferredStatus = metadata?.code === 'P2025'
    ? 404
    : metadata?.code === 'P2002'
      ? 409
      : metadata?.name === 'ZodError'
        ? 400
        : 500
  const candidate = metadata?.statusCode === undefined ? inferredStatus : Number(metadata.statusCode)
  const statusCode = Number.isInteger(candidate) && candidate >= 400 && candidate <= 599
    ? candidate
    : 500
  const message = publicMessages.get(statusCode)
    ?? (statusCode < 500 ? 'Request rejected' : 'Internal server error')

  return { statusCode, body: { error: message } }
}
