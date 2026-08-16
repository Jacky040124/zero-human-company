import { z } from 'zod'
import {
  createDemoRunSchema,
  demoRunSnapshotSchema,
  ownerDecisionSchema,
  proofItemSchema,
} from '@zero-human/contracts'

function openApiSchema(schema: z.ZodType, io: 'input' | 'output' = 'output') {
  const { $schema: _dialect, ...jsonSchema } = z.toJSONSchema(schema, { io })
  return jsonSchema
}

const idParameter = {
  name: 'id',
  in: 'path',
  required: true,
  schema: { type: 'string' },
} as const

const snapshotResponse = {
  description: 'Complete sanitized run snapshot',
  content: { 'application/json': { schema: { $ref: '#/components/schemas/DemoRunSnapshot' } } },
} as const

const errorResponses = {
  400: { description: 'Invalid request', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
  401: { description: 'Owner session required', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
  404: { description: 'Run or route not found', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
  409: { description: 'Request conflicts with persisted state', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
  429: { description: 'Too many authentication attempts', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
  503: { description: 'Required upstream configuration is missing', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
} as const

export const openapiDocument = {
  openapi: '3.1.0',
  info: {
    title: 'Zero Human Company API',
    version: '1.0.0',
    description: 'Frozen frontend integration seam. All snapshot, timeline, proof, and uncaught error responses are sanitized.',
  },
  paths: {
    '/healthz': {
      get: {
        summary: 'Check API health and judge-mode state',
        responses: { 200: { description: 'Healthy', content: { 'application/json': { schema: { $ref: '#/components/schemas/Health' } } } } },
      },
    },
    '/api/v1/auth/login': {
      post: {
        summary: 'Create a signed owner session',
        requestBody: { required: true, content: { 'application/json': { schema: { $ref: '#/components/schemas/LoginRequest' } } } },
        responses: {
          200: { description: 'Authenticated', content: { 'application/json': { schema: { $ref: '#/components/schemas/AuthSession' } } } },
          400: errorResponses[400],
          401: errorResponses[401],
          429: errorResponses[429],
        },
      },
    },
    '/api/v1/auth/logout': {
      post: {
        summary: 'Clear the owner session',
        responses: { 200: { description: 'Logged out', content: { 'application/json': { schema: { $ref: '#/components/schemas/AuthSession' } } } } },
      },
    },
    '/api/v1/auth/session': {
      get: {
        summary: 'Inspect the owner session',
        responses: { 200: { description: 'Session state', content: { 'application/json': { schema: { $ref: '#/components/schemas/AuthSession' } } } } },
      },
    },
    '/api/v1/demo-runs/active': {
      get: {
        summary: 'Get the latest complete run snapshot',
        responses: { 200: snapshotResponse, 404: errorResponses[404] },
      },
    },
    '/api/v1/demo-runs': {
      post: {
        summary: 'Create a run',
        security: [{ ownerSession: [] }],
        requestBody: { required: false, content: { 'application/json': { schema: openApiSchema(createDemoRunSchema, 'input') } } },
        responses: { 201: snapshotResponse, 400: errorResponses[400], 401: errorResponses[401] },
      },
    },
    '/api/v1/demo-runs/{id}': {
      get: {
        summary: 'Get one complete run snapshot',
        parameters: [idParameter],
        responses: { 200: snapshotResponse, 404: errorResponses[404] },
      },
    },
    '/api/v1/demo-runs/{id}/events': {
      get: {
        summary: 'Stream complete run snapshots over SSE',
        description: 'Emits event: snapshot with one DemoRunSnapshot JSON payload immediately and every 1.5 seconds.',
        parameters: [idParameter],
        responses: {
          200: {
            description: 'Server-sent snapshot stream',
            content: { 'text/event-stream': { schema: { type: 'string' } } },
          },
          404: errorResponses[404],
        },
      },
    },
    '/api/v1/demo-runs/{id}/proof': {
      get: {
        summary: 'Get sanitized same-run provider proof',
        parameters: [idParameter],
        responses: {
          200: { description: 'Proof ledger', content: { 'application/json': { schema: { $ref: '#/components/schemas/ProofResponse' } } } },
          404: errorResponses[404],
        },
      },
    },
    '/api/v1/demo-runs/{id}/verify': {
      get: {
        summary: 'Run the strict same-run proof verifier',
        parameters: [idParameter],
        responses: {
          200: { description: 'Verification report', content: { 'application/json': { schema: { $ref: '#/components/schemas/VerificationReport' } } } },
          404: errorResponses[404],
        },
      },
    },
    '/api/v1/demo-runs/{id}/activate': {
      post: {
        summary: 'Create or resume the $5 Stripe TEST Checkout Session',
        security: [{ ownerSession: [] }],
        parameters: [idParameter],
        responses: {
          200: { description: 'Sandbox checkout URL', content: { 'application/json': { schema: { type: 'object', required: ['checkoutUrl'], properties: { checkoutUrl: { type: 'string', format: 'uri' } } } } } },
          401: errorResponses[401],
          404: errorResponses[404],
          409: errorResponses[409],
        },
      },
    },
    '/api/v1/demo-runs/{id}/rehearse': {
      post: {
        summary: 'Run the deterministic local fake rehearsal',
        security: [{ ownerSession: [] }],
        parameters: [idParameter],
        responses: { 200: snapshotResponse, 401: errorResponses[401], 404: errorResponses[404] },
      },
    },
    '/api/v1/demo-runs/{id}/campaign-decision': {
      post: {
        summary: 'Owner action 1: approve or reject the tested campaign',
        security: [{ ownerSession: [] }],
        parameters: [idParameter],
        requestBody: { required: true, content: { 'application/json': { schema: openApiSchema(ownerDecisionSchema, 'input') } } },
        responses: { 200: snapshotResponse, 400: errorResponses[400], 401: errorResponses[401], 404: errorResponses[404], 409: errorResponses[409] },
      },
    },
    '/api/v1/demo-runs/{id}/tasks/{slug}': {
      post: {
        summary: 'Trigger one allowlisted Render task',
        security: [{ ownerSession: [] }],
        parameters: [
          idParameter,
          {
            name: 'slug',
            in: 'path',
            required: true,
            schema: {
              type: 'string',
              enum: ['run-terac-campaign-study', 'discover-research-leads', 'send-nordlicht-outreach', 'run-band-negotiation', 'review-contract-and-create-envelope', 'prove-render-retry'],
            },
          },
        ],
        responses: {
          200: { description: 'Task intent and current snapshot', content: { 'application/json': { schema: { $ref: '#/components/schemas/TaskTriggerResponse' } } } },
          400: errorResponses[400],
          401: errorResponses[401],
          404: errorResponses[404],
        },
      },
    },
    '/api/v1/outreach/draft': {
      post: {
        summary: 'Draft a first-touch email for a discovered buyer with a cheap OpenRouter model',
        requestBody: { required: true, content: { 'application/json': { schema: { $ref: '#/components/schemas/OutreachDraftRequest' } } } },
        responses: {
          200: { description: 'Generated first email', content: { 'application/json': { schema: { $ref: '#/components/schemas/OutreachDraft' } } } },
          400: errorResponses[400],
        },
      },
    },
    '/api/v1/discovery/search': {
      post: {
        summary: 'Search Apollo organizations through Monid and persist research-only companies onto the latest run',
        requestBody: { required: false, content: { 'application/json': { schema: { $ref: '#/components/schemas/BuyerSearchRequest' } } } },
        responses: {
          200: { description: 'Apollo company matches', content: { 'application/json': { schema: { $ref: '#/components/schemas/BuyerSearchResponse' } } } },
          400: errorResponses[400],
          503: errorResponses[503],
        },
      },
    },
    '/api/v1/catalog/extract': {
      post: {
        summary: 'Extract product records from catalog text or a PDF via Pioneer',
        requestBody: {
          required: true,
          content: { 'application/json': { schema: { $ref: '#/components/schemas/CatalogExtractRequest' } } },
        },
        responses: {
          200: { description: 'SSE stream of chunk/done events with extracted catalog records' },
          400: errorResponses[400],
          503: errorResponses[503],
        },
      },
    },
    '/webhooks/stripe': { post: { summary: 'Receive signed Stripe TEST events', responses: { 200: { description: 'Accepted or ignored' } } } },
    '/webhooks/linq': { post: { summary: 'Receive signed Linq role-player events', responses: { 200: { description: 'Accepted' }, 202: { description: 'Safely ignored or unmatched' }, 503: { description: 'Retry after proposal evidence is durable' } } } },
    '/webhooks/documenso': { post: { summary: 'Receive owner-first and buyer-second signing events', responses: { 200: { description: 'Accepted' }, 202: { description: 'Safely ignored' } } } },
  },
  components: {
    securitySchemes: {
      ownerSession: { type: 'apiKey', in: 'cookie', name: 'zhc_owner' },
    },
    schemas: {
      DemoRunSnapshot: openApiSchema(demoRunSnapshotSchema),
      ProofItem: openApiSchema(proofItemSchema),
      Error: { type: 'object', required: ['error'], properties: { error: { type: 'string' } } },
      Health: { type: 'object', required: ['ok', 'judgeMode'], properties: { ok: { const: true }, judgeMode: { type: 'boolean' } } },
      OutreachDraftRequest: {
        type: 'object',
        additionalProperties: false,
        required: ['company'],
        properties: {
          company: { type: 'string' },
          country: { type: 'string' },
          description: { type: 'string' },
          buyer: { type: 'string' },
          focus: { type: 'string' },
        },
      },
      OutreachDraft: {
        type: 'object',
        required: ['contactName', 'contactEmail', 'subject', 'body'],
        properties: {
          contactName: { type: 'string' },
          contactEmail: { type: 'string' },
          subject: { type: 'string' },
          body: { type: 'string' },
        },
      },
      BuyerSearchRequest: {
        type: 'object',
        additionalProperties: false,
        properties: {
          query: { type: 'string' },
          region: { type: 'string' },
          buyerType: { type: 'string' },
          maxResults: { type: 'integer', minimum: 1, maximum: 25 },
        },
      },
      BuyerSearchCompany: {
        type: 'object',
        required: ['externalCompanyId', 'name', 'website', 'country', 'description', 'researchOnly'],
        properties: {
          externalCompanyId: { type: 'string' },
          name: { type: 'string' },
          website: { type: ['string', 'null'] },
          country: { type: ['string', 'null'] },
          description: { type: ['string', 'null'] },
          researchOnly: { const: true },
        },
      },
      BuyerSearchResponse: {
        type: 'object',
        required: ['live', 'persisted', 'demoRunId', 'added', 'query', 'companies'],
        properties: {
          live: { type: 'boolean' },
          persisted: { type: 'boolean' },
          demoRunId: { type: ['string', 'null'] },
          added: { type: 'integer' },
          query: { type: 'string' },
          companies: { type: 'array', items: { $ref: '#/components/schemas/BuyerSearchCompany' } },
          snapshot: { $ref: '#/components/schemas/DemoRunSnapshot' },
        },
      },
      LoginRequest: { type: 'object', required: ['email', 'password'], additionalProperties: false, properties: { email: { type: 'string', format: 'email' }, password: { type: 'string' } } },
      AuthSession: { type: 'object', required: ['authenticated'], properties: { authenticated: { type: 'boolean' } } },
      ProofResponse: {
        type: 'object',
        required: ['demoRunId', 'proof'],
        properties: { demoRunId: { type: 'string' }, proof: { type: 'array', items: { $ref: '#/components/schemas/ProofItem' } } },
      },
      VerificationReport: {
        type: 'object',
        required: ['runId', 'passed', 'checks'],
        properties: {
          runId: { type: 'string' },
          passed: { type: 'boolean' },
          checks: {
            type: 'array',
            items: { type: 'object', required: ['name', 'passed', 'detail'], properties: { name: { type: 'string' }, passed: { type: 'boolean' }, detail: { type: 'string' } } },
          },
        },
      },
      TaskTriggerResponse: {
        type: 'object',
        required: ['taskRunId', 'snapshot'],
        properties: { taskRunId: { type: 'string' }, snapshot: { $ref: '#/components/schemas/DemoRunSnapshot' } },
      },
      CatalogExtractRequest: {
        type: 'object',
        additionalProperties: false,
        properties: {
          text: { type: 'string' },
          pdfBase64: { type: 'string', description: 'Raw base64 PDF bytes without a data: prefix' },
          filename: { type: 'string' },
          threshold: { type: 'number', minimum: 0.2, maximum: 0.9, default: 0.5 },
        },
      },
      CatalogFieldValue: {
        type: 'object',
        required: ['text', 'confidence'],
        properties: { text: { type: 'string' }, confidence: { type: 'number' } },
        nullable: true,
      },
      CatalogRecord: {
        type: 'object',
        required: ['id', 'partNumber', 'productName', 'material', 'finish', 'threadSpec', 'specs', 'confidence', 'fields'],
        properties: {
          id: { type: 'string' },
          partNumber: { type: 'string', nullable: true },
          productName: { type: 'string', nullable: true },
          material: { type: 'string', nullable: true },
          finish: { type: 'string', nullable: true },
          threadSpec: { type: 'string', nullable: true },
          specs: { type: 'array', items: { type: 'string' }, nullable: true },
          confidence: { type: 'number' },
          fields: {
            type: 'object',
            required: ['part_number', 'product_name', 'material', 'finish', 'thread_spec', 'specs'],
            properties: {
              part_number: { $ref: '#/components/schemas/CatalogFieldValue' },
              product_name: { $ref: '#/components/schemas/CatalogFieldValue' },
              material: { $ref: '#/components/schemas/CatalogFieldValue' },
              finish: { $ref: '#/components/schemas/CatalogFieldValue' },
              thread_spec: { $ref: '#/components/schemas/CatalogFieldValue' },
              specs: { $ref: '#/components/schemas/CatalogFieldValue' },
            },
          },
        },
      },
      CatalogExtractResponse: {
        type: 'object',
        required: ['records', 'chunkCount', 'live'],
        properties: {
          records: { type: 'array', items: { $ref: '#/components/schemas/CatalogRecord' } },
          chunkCount: { type: 'integer' },
          live: { const: true },
        },
      },
    },
  },
} as const
