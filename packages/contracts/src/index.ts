import { z } from 'zod'

export const demoRunStatusSchema = z.enum([
  'CREATED',
  'AWAITING_PAYMENT',
  'STUDY_RUNNING',
  'AWAITING_CAMPAIGN_APPROVAL',
  'RUNNING',
  'AWAITING_OWNER_SIGNATURE',
  'COMPLETE',
  'PAUSED',
  'FAILED',
])

export const opportunityStageSchema = z.enum([
  'RESEARCHING',
  'OUTREACH',
  'ENGAGED',
  'NEGOTIATING',
  'AGREEMENT',
  'SIGNING',
  'SIGNED',
  'PAUSED',
  'LOST',
])

export const providerSchema = z.enum([
  'STRIPE',
  'TERAC',
  'LINQ',
  'BAND',
  'RENDER',
  'DOCUMENSO',
  'MONID',
  'OPENAI',
  'LOCAL',
])

export const providerActionStatusSchema = z.enum([
  'PLANNED',
  'RUNNING',
  'SUCCEEDED',
  'FAILED',
  'RECONCILE_REQUIRED',
])

export const proofItemSchema = z.object({
  provider: providerSchema,
  kind: z.string().min(1),
  externalId: z.string().min(1),
  live: z.boolean(),
  status: z.string().min(1),
  occurredAt: z.string().datetime(),
  detail: z.string().optional(),
})

export const timelineEventSchema = z.object({
  sequence: z.number().int().nonnegative(),
  type: z.string().min(1),
  status: z.string().min(1),
  summary: z.string().min(1),
  actor: z.string().min(1),
  occurredAt: z.string().datetime(),
  proofRef: z.string().nullable(),
})

export const opportunitySchema = z.object({
  id: z.string(),
  company: z.string(),
  contactName: z.string(),
  country: z.string(),
  focus: z.string(),
  stage: opportunityStageSchema,
  stageReason: z.string().nullable(),
  updatedAt: z.string().datetime(),
})

export const demoRunSnapshotSchema = z.object({
  id: z.string(),
  status: demoRunStatusSchema,
  mode: z.enum(['FAKE', 'JUDGE']),
  workspaceName: z.string(),
  pilot: z.object({
    status: z.enum(['PENDING', 'PAID']),
    amount: z.number().int(),
    currency: z.string(),
    checkoutUrl: z.string().url().nullable(),
  }),
  ownerActions: z.object({
    used: z.number().int().min(0).max(2),
    pending: z.enum(['CAMPAIGN_APPROVAL', 'OWNER_SIGNATURE']).nullable(),
  }),
  opportunities: z.array(opportunitySchema),
  timeline: z.array(timelineEventSchema),
  proof: z.array(proofItemSchema),
  updatedAt: z.string().datetime(),
})

export const ownerDecisionSchema = z.object({
  decision: z.enum(['APPROVE', 'REJECT']),
})

export const createDemoRunSchema = z.object({
  mode: z.enum(['FAKE', 'JUDGE']).default('FAKE'),
})

export type DemoRunStatus = z.infer<typeof demoRunStatusSchema>
export type OpportunityStage = z.infer<typeof opportunityStageSchema>
export type Provider = z.infer<typeof providerSchema>
export type ProviderActionStatus = z.infer<typeof providerActionStatusSchema>
export type ProofItem = z.infer<typeof proofItemSchema>
export type TimelineEvent = z.infer<typeof timelineEventSchema>
export type Opportunity = z.infer<typeof opportunitySchema>
export type DemoRunSnapshot = z.infer<typeof demoRunSnapshotSchema>
export type OwnerDecision = z.infer<typeof ownerDecisionSchema>
