-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "RunMode" AS ENUM ('FAKE', 'JUDGE');

-- CreateEnum
CREATE TYPE "DemoRunStatus" AS ENUM ('CREATED', 'AWAITING_PAYMENT', 'STUDY_RUNNING', 'AWAITING_CAMPAIGN_APPROVAL', 'RUNNING', 'AWAITING_OWNER_SIGNATURE', 'COMPLETE', 'PAUSED', 'FAILED');

-- CreateEnum
CREATE TYPE "PilotStatus" AS ENUM ('PENDING', 'PAID');

-- CreateEnum
CREATE TYPE "RevisionStatus" AS ENUM ('DRAFT', 'UNDER_STUDY', 'READY_FOR_APPROVAL', 'ACTIVE', 'SUPERSEDED');

-- CreateEnum
CREATE TYPE "OpportunityStage" AS ENUM ('RESEARCHING', 'OUTREACH', 'ENGAGED', 'NEGOTIATING', 'AGREEMENT', 'SIGNING', 'SIGNED', 'PAUSED', 'LOST');

-- CreateEnum
CREATE TYPE "Provider" AS ENUM ('STRIPE', 'TERAC', 'LINQ', 'BAND', 'RENDER', 'DOCUMENSO', 'MONID', 'OPENAI', 'LOCAL');

-- CreateEnum
CREATE TYPE "ProviderActionStatus" AS ENUM ('PLANNED', 'RUNNING', 'SUCCEEDED', 'FAILED', 'RECONCILE_REQUIRED');

-- CreateEnum
CREATE TYPE "ApprovalKind" AS ENUM ('CAMPAIGN', 'OWNER_SIGNATURE');

-- CreateEnum
CREATE TYPE "ApprovalDecision" AS ENUM ('APPROVE', 'REJECT');

-- CreateTable
CREATE TABLE "Workspace" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "ownerEmail" TEXT NOT NULL,
    "killSwitch" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Workspace_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PilotActivation" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "status" "PilotStatus" NOT NULL DEFAULT 'PENDING',
    "amount" INTEGER NOT NULL DEFAULT 500,
    "currency" TEXT NOT NULL DEFAULT 'usd',
    "checkoutUrl" TEXT,
    "paidAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PilotActivation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Campaign" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "activeRevisionId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Campaign_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CampaignRevision" (
    "id" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "body" JSONB NOT NULL,
    "status" "RevisionStatus" NOT NULL DEFAULT 'DRAFT',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CampaignRevision_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DemoRun" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "status" "DemoRunStatus" NOT NULL DEFAULT 'CREATED',
    "mode" "RunMode" NOT NULL DEFAULT 'FAKE',
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DemoRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Payment" (
    "id" TEXT NOT NULL,
    "demoRunId" TEXT NOT NULL,
    "pilotActivationId" TEXT NOT NULL,
    "provider" "Provider" NOT NULL DEFAULT 'STRIPE',
    "stripeEventId" TEXT,
    "checkoutSessionId" TEXT,
    "paymentIntentId" TEXT,
    "livemode" BOOLEAN NOT NULL,
    "amount" INTEGER NOT NULL,
    "currency" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Payment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HumanStudy" (
    "id" TEXT NOT NULL,
    "demoRunId" TEXT NOT NULL,
    "provider" "Provider" NOT NULL DEFAULT 'TERAC',
    "externalId" TEXT NOT NULL,
    "live" BOOLEAN NOT NULL,
    "status" TEXT NOT NULL,
    "baselineScore" DOUBLE PRECISION NOT NULL,
    "selectedScore" DOUBLE PRECISION NOT NULL,
    "scoreDelta" DOUBLE PRECISION NOT NULL,
    "rubric" JSONB NOT NULL,
    "selectedRevisionId" TEXT NOT NULL,
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "HumanStudy_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Company" (
    "id" TEXT NOT NULL,
    "demoRunId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "website" TEXT,
    "city" TEXT,
    "country" TEXT NOT NULL,
    "focus" TEXT NOT NULL,
    "monidProviderId" TEXT,
    "monidLive" BOOLEAN NOT NULL DEFAULT false,
    "researchOnly" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Company_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Contact" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "title" TEXT,
    "channel" TEXT,
    "addressHash" TEXT,
    "consented" BOOLEAN NOT NULL DEFAULT false,
    "rolePlayer" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Contact_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Opportunity" (
    "id" TEXT NOT NULL,
    "demoRunId" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "contactId" TEXT,
    "stage" "OpportunityStage" NOT NULL DEFAULT 'RESEARCHING',
    "stageReason" TEXT,
    "version" INTEGER NOT NULL DEFAULT 0,
    "sequence" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Opportunity_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Message" (
    "id" TEXT NOT NULL,
    "demoRunId" TEXT NOT NULL,
    "opportunityId" TEXT NOT NULL,
    "provider" "Provider" NOT NULL DEFAULT 'LINQ',
    "externalId" TEXT,
    "threadExternalId" TEXT,
    "direction" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "sanitizedBody" TEXT NOT NULL,
    "rolePlayer" BOOLEAN NOT NULL,
    "live" BOOLEAN NOT NULL DEFAULT false,
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Message_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AgentHandoff" (
    "id" TEXT NOT NULL,
    "demoRunId" TEXT NOT NULL,
    "provider" "Provider" NOT NULL DEFAULT 'BAND',
    "roomId" TEXT NOT NULL,
    "live" BOOLEAN NOT NULL,
    "status" TEXT NOT NULL,
    "verdict" JSONB NOT NULL,
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AgentHandoff_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkflowRun" (
    "id" TEXT NOT NULL,
    "demoRunId" TEXT NOT NULL,
    "provider" "Provider" NOT NULL DEFAULT 'RENDER',
    "externalId" TEXT NOT NULL,
    "taskSlug" TEXT NOT NULL,
    "live" BOOLEAN NOT NULL,
    "status" TEXT NOT NULL,
    "attempt" INTEGER NOT NULL,
    "retried" BOOLEAN NOT NULL DEFAULT false,
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WorkflowRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Document" (
    "id" TEXT NOT NULL,
    "demoRunId" TEXT NOT NULL,
    "opportunityId" TEXT NOT NULL,
    "provider" "Provider" NOT NULL DEFAULT 'DOCUMENSO',
    "externalId" TEXT NOT NULL,
    "live" BOOLEAN NOT NULL,
    "status" TEXT NOT NULL,
    "ownerSignedAt" TIMESTAMP(3),
    "buyerSignedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Document_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Approval" (
    "id" TEXT NOT NULL,
    "demoRunId" TEXT NOT NULL,
    "kind" "ApprovalKind" NOT NULL,
    "decision" "ApprovalDecision" NOT NULL,
    "actor" TEXT NOT NULL,
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Approval_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Event" (
    "id" TEXT NOT NULL,
    "demoRunId" TEXT NOT NULL,
    "opportunityId" TEXT,
    "sequence" INTEGER NOT NULL,
    "type" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "actor" TEXT NOT NULL,
    "proofRef" TEXT,
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Event_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProviderEvent" (
    "id" TEXT NOT NULL,
    "demoRunId" TEXT NOT NULL,
    "provider" "Provider" NOT NULL,
    "externalEventId" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "payloadHash" TEXT NOT NULL,
    "processedAt" TIMESTAMP(3),
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProviderEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProviderAction" (
    "id" TEXT NOT NULL,
    "demoRunId" TEXT NOT NULL,
    "provider" "Provider" NOT NULL,
    "kind" TEXT NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "status" "ProviderActionStatus" NOT NULL DEFAULT 'PLANNED',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "request" JSONB NOT NULL,
    "providerExternalId" TEXT,
    "redactedResponse" JSONB,
    "lastError" TEXT,
    "runAfter" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProviderAction_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PilotActivation_workspaceId_key" ON "PilotActivation"("workspaceId");

-- CreateIndex
CREATE UNIQUE INDEX "Campaign_activeRevisionId_key" ON "Campaign"("activeRevisionId");

-- CreateIndex
CREATE INDEX "DemoRun_status_createdAt_idx" ON "DemoRun"("status", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Payment_stripeEventId_key" ON "Payment"("stripeEventId");

-- CreateIndex
CREATE UNIQUE INDEX "Payment_checkoutSessionId_key" ON "Payment"("checkoutSessionId");

-- CreateIndex
CREATE UNIQUE INDEX "HumanStudy_provider_externalId_key" ON "HumanStudy"("provider", "externalId");

-- CreateIndex
CREATE UNIQUE INDEX "Company_demoRunId_name_key" ON "Company"("demoRunId", "name");

-- CreateIndex
CREATE INDEX "Opportunity_demoRunId_stage_idx" ON "Opportunity"("demoRunId", "stage");

-- CreateIndex
CREATE UNIQUE INDEX "Opportunity_demoRunId_companyId_key" ON "Opportunity"("demoRunId", "companyId");

-- CreateIndex
CREATE UNIQUE INDEX "Message_provider_externalId_key" ON "Message"("provider", "externalId");

-- CreateIndex
CREATE UNIQUE INDEX "AgentHandoff_provider_roomId_key" ON "AgentHandoff"("provider", "roomId");

-- CreateIndex
CREATE UNIQUE INDEX "WorkflowRun_provider_externalId_key" ON "WorkflowRun"("provider", "externalId");

-- CreateIndex
CREATE UNIQUE INDEX "Document_provider_externalId_key" ON "Document"("provider", "externalId");

-- CreateIndex
CREATE UNIQUE INDEX "Approval_demoRunId_kind_key" ON "Approval"("demoRunId", "kind");

-- CreateIndex
CREATE INDEX "Event_demoRunId_occurredAt_idx" ON "Event"("demoRunId", "occurredAt");

-- CreateIndex
CREATE UNIQUE INDEX "Event_opportunityId_sequence_key" ON "Event"("opportunityId", "sequence");

-- CreateIndex
CREATE UNIQUE INDEX "ProviderEvent_provider_externalEventId_key" ON "ProviderEvent"("provider", "externalEventId");

-- CreateIndex
CREATE UNIQUE INDEX "ProviderAction_idempotencyKey_key" ON "ProviderAction"("idempotencyKey");

-- CreateIndex
CREATE INDEX "ProviderAction_status_runAfter_idx" ON "ProviderAction"("status", "runAfter");

-- AddForeignKey
ALTER TABLE "PilotActivation" ADD CONSTRAINT "PilotActivation_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Campaign" ADD CONSTRAINT "Campaign_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Campaign" ADD CONSTRAINT "Campaign_activeRevisionId_fkey" FOREIGN KEY ("activeRevisionId") REFERENCES "CampaignRevision"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CampaignRevision" ADD CONSTRAINT "CampaignRevision_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DemoRun" ADD CONSTRAINT "DemoRun_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DemoRun" ADD CONSTRAINT "DemoRun_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_demoRunId_fkey" FOREIGN KEY ("demoRunId") REFERENCES "DemoRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_pilotActivationId_fkey" FOREIGN KEY ("pilotActivationId") REFERENCES "PilotActivation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HumanStudy" ADD CONSTRAINT "HumanStudy_demoRunId_fkey" FOREIGN KEY ("demoRunId") REFERENCES "DemoRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HumanStudy" ADD CONSTRAINT "HumanStudy_selectedRevisionId_fkey" FOREIGN KEY ("selectedRevisionId") REFERENCES "CampaignRevision"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Company" ADD CONSTRAINT "Company_demoRunId_fkey" FOREIGN KEY ("demoRunId") REFERENCES "DemoRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Contact" ADD CONSTRAINT "Contact_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Opportunity" ADD CONSTRAINT "Opportunity_demoRunId_fkey" FOREIGN KEY ("demoRunId") REFERENCES "DemoRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Opportunity" ADD CONSTRAINT "Opportunity_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Opportunity" ADD CONSTRAINT "Opportunity_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Opportunity" ADD CONSTRAINT "Opportunity_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "Contact"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Message" ADD CONSTRAINT "Message_demoRunId_fkey" FOREIGN KEY ("demoRunId") REFERENCES "DemoRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Message" ADD CONSTRAINT "Message_opportunityId_fkey" FOREIGN KEY ("opportunityId") REFERENCES "Opportunity"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgentHandoff" ADD CONSTRAINT "AgentHandoff_demoRunId_fkey" FOREIGN KEY ("demoRunId") REFERENCES "DemoRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkflowRun" ADD CONSTRAINT "WorkflowRun_demoRunId_fkey" FOREIGN KEY ("demoRunId") REFERENCES "DemoRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Document" ADD CONSTRAINT "Document_demoRunId_fkey" FOREIGN KEY ("demoRunId") REFERENCES "DemoRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Document" ADD CONSTRAINT "Document_opportunityId_fkey" FOREIGN KEY ("opportunityId") REFERENCES "Opportunity"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Approval" ADD CONSTRAINT "Approval_demoRunId_fkey" FOREIGN KEY ("demoRunId") REFERENCES "DemoRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Event" ADD CONSTRAINT "Event_demoRunId_fkey" FOREIGN KEY ("demoRunId") REFERENCES "DemoRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Event" ADD CONSTRAINT "Event_opportunityId_fkey" FOREIGN KEY ("opportunityId") REFERENCES "Opportunity"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProviderEvent" ADD CONSTRAINT "ProviderEvent_demoRunId_fkey" FOREIGN KEY ("demoRunId") REFERENCES "DemoRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProviderAction" ADD CONSTRAINT "ProviderAction_demoRunId_fkey" FOREIGN KEY ("demoRunId") REFERENCES "DemoRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;
