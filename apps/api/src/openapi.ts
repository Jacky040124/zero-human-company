export const openapiDocument = {
  openapi: '3.1.0',
  info: { title: 'Zero Human Company API', version: '1.0.0' },
  paths: {
    '/api/v1/demo-runs/active': { get: { summary: 'Get the latest run snapshot' } },
    '/api/v1/demo-runs/{id}': { get: { summary: 'Get one run snapshot' } },
    '/api/v1/demo-runs/{id}/events': { get: { summary: 'Stream run snapshots over SSE' } },
    '/api/v1/demo-runs/{id}/proof': { get: { summary: 'Get sanitized same-run provider proof' } },
    '/api/v1/demo-runs/{id}/campaign-decision': { post: { summary: 'Owner action 1: approve or reject campaign' } },
    '/api/v1/auth/login': { post: { summary: 'Create signed owner session' } },
    '/webhooks/stripe': { post: { summary: 'Receive signed Stripe events' } },
    '/webhooks/linq': { post: { summary: 'Receive signed Linq events' } },
    '/webhooks/documenso': { post: { summary: 'Receive signed Documenso events' } },
  },
} as const
