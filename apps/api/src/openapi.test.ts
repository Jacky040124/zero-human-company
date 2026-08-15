import { describe, expect, it } from 'vitest'
import { openapiDocument } from './openapi.js'

describe('frontend integration OpenAPI surface', () => {
  it('documents every stable frontend and operator route', () => {
    const paths = Object.keys(openapiDocument.paths)
    expect(paths).toEqual(expect.arrayContaining([
      '/api/v1/auth/login',
      '/api/v1/auth/logout',
      '/api/v1/auth/session',
      '/api/v1/demo-runs/active',
      '/api/v1/demo-runs/{id}',
      '/api/v1/demo-runs/{id}/events',
      '/api/v1/demo-runs/{id}/proof',
      '/api/v1/demo-runs/{id}/verify',
      '/api/v1/demo-runs/{id}/activate',
      '/api/v1/demo-runs/{id}/campaign-decision',
    ]))
  })

  it('documents the frozen opportunity location and research-only fields', () => {
    const snapshot = openapiDocument.components.schemas.DemoRunSnapshot as {
      properties?: { opportunities?: { items?: { properties?: Record<string, unknown> } } }
    }
    expect(snapshot.properties?.opportunities?.items?.properties).toMatchObject({
      country: { type: 'string' },
      researchOnly: { type: 'boolean' },
    })
    expect(snapshot.properties?.opportunities?.items?.properties?.city).toBeDefined()
  })

  it('marks all mutating run endpoints as owner-session protected', () => {
    const paths = openapiDocument.paths
    for (const path of [
      '/api/v1/demo-runs',
      '/api/v1/demo-runs/{id}/activate',
      '/api/v1/demo-runs/{id}/rehearse',
      '/api/v1/demo-runs/{id}/campaign-decision',
      '/api/v1/demo-runs/{id}/tasks/{slug}',
    ] as const) {
      expect(paths[path].post.security).toEqual([{ ownerSession: [] }])
    }
  })
})
