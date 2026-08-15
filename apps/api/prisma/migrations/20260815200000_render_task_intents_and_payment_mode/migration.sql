-- CreateEnum
CREATE TYPE "RenderTaskTriggerStatus" AS ENUM ('PLANNED', 'TRIGGERING', 'TRIGGERED', 'FAILED');

-- CreateEnum
CREATE TYPE "PaymentProviderMode" AS ENUM ('TEST', 'LIVE', 'FAKE');

-- AlterTable
ALTER TABLE "Payment" ADD COLUMN "providerMode" "PaymentProviderMode" NOT NULL DEFAULT 'TEST';

-- CreateTable
CREATE TABLE "RenderTaskIntent" (
    "id" TEXT NOT NULL,
    "demoRunId" TEXT NOT NULL,
    "taskSlug" TEXT NOT NULL,
    "externalId" TEXT,
    "triggerStatus" "RenderTaskTriggerStatus" NOT NULL DEFAULT 'PLANNED',
    "triggerAttempts" INTEGER NOT NULL DEFAULT 0,
    "lastError" TEXT,
    "leaseExpiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RenderTaskIntent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "RenderTaskIntent_externalId_key" ON "RenderTaskIntent"("externalId");

-- CreateIndex
CREATE UNIQUE INDEX "RenderTaskIntent_demoRunId_taskSlug_key" ON "RenderTaskIntent"("demoRunId", "taskSlug");

-- CreateIndex
CREATE INDEX "RenderTaskIntent_triggerStatus_leaseExpiresAt_idx" ON "RenderTaskIntent"("triggerStatus", "leaseExpiresAt");

-- AddForeignKey
ALTER TABLE "RenderTaskIntent" ADD CONSTRAINT "RenderTaskIntent_demoRunId_fkey" FOREIGN KEY ("demoRunId") REFERENCES "DemoRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;
