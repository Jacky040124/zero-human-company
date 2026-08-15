import { describe, expect, it } from 'vitest'
import { toPublicHttpError } from './http-errors.js'

describe('public HTTP error boundary', () => {
  it('does not expose provider payloads, credentials, or contact details', () => {
    const error = Object.assign(
      new Error('Provider returned 500: token=secret buyer@example.com +1 415 555 1212'),
      { statusCode: 500 },
    )

    expect(toPublicHttpError(error)).toEqual({
      statusCode: 500,
      body: { error: 'Internal server error' },
    })
  })

  it('preserves useful safe status semantics without preserving raw messages', () => {
    expect(toPublicHttpError(Object.assign(new Error('private conflict detail'), { statusCode: 409 })))
      .toEqual({ statusCode: 409, body: { error: 'Conflict' } })
    expect(toPublicHttpError(Object.assign(new Error('retry with provider secret'), { statusCode: 503 })))
      .toEqual({ statusCode: 503, body: { error: 'Service temporarily unavailable' } })
    expect(toPublicHttpError(Object.assign(new Error('private'), { statusCode: 418 })))
      .toEqual({ statusCode: 418, body: { error: 'Request rejected' } })
  })

  it('falls back to a safe internal error for invalid status metadata', () => {
    expect(toPublicHttpError({ statusCode: 'oops', message: 'password=hunter2' }))
      .toEqual({ statusCode: 500, body: { error: 'Internal server error' } })
  })

  it('maps validation and Prisma lookup/uniqueness errors to stable safe statuses', () => {
    expect(toPublicHttpError({ name: 'ZodError', message: 'private input' }))
      .toEqual({ statusCode: 400, body: { error: 'Invalid request' } })
    expect(toPublicHttpError({ code: 'P2025', message: 'private query' }))
      .toEqual({ statusCode: 404, body: { error: 'Not found' } })
    expect(toPublicHttpError({ code: 'P2002', message: 'private constraint' }))
      .toEqual({ statusCode: 409, body: { error: 'Conflict' } })
  })
})
