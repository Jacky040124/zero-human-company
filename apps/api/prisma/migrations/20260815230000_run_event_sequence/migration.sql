-- Serialize the complete public timeline through the owning DemoRun row and
-- exclusively lease each inbound provider receipt while its effects run.
BEGIN;

ALTER TABLE "DemoRun"
ADD COLUMN "eventSequence" INTEGER NOT NULL DEFAULT 0;

ALTER TABLE "ProviderEvent"
ADD COLUMN "processingToken" TEXT,
ADD COLUMN "processingExpiresAt" TIMESTAMP(3);

ALTER TABLE "RenderTaskIntent"
ADD COLUMN "triggerToken" TEXT;

CREATE UNIQUE INDEX "RenderTaskIntent_triggerToken_key"
ON "RenderTaskIntent"("triggerToken");

-- Prisma does not wrap migration SQL in a transaction automatically. ALTER
-- takes and retains the DemoRun lock first, matching the legacy writer's lock
-- order; then block Event writers for normalization/index/trigger creation.
LOCK TABLE "Event" IN SHARE ROW EXCLUSIVE MODE;

-- The existing per-opportunity uniqueness check can reject an otherwise valid
-- set-based renumber because PostgreSQL checks intermediate row values. The
-- table lock prevents writers while it is briefly removed and recreated.
DROP INDEX "Event_opportunityId_sequence_key";

-- The legacy writer used independent per-opportunity and run-level counters.
-- Normalize every event into one deterministic, run-global public order.
WITH ranked_events AS (
  SELECT
    "id",
    ROW_NUMBER() OVER (
      PARTITION BY "demoRunId"
      ORDER BY "occurredAt", "id"
    ) AS normalized_sequence
  FROM "Event"
)
UPDATE "Event" AS event
SET "sequence" = ranked_events.normalized_sequence
FROM ranked_events
WHERE event."id" = ranked_events."id";

UPDATE "DemoRun" AS run
SET "eventSequence" = COALESCE((
  SELECT MAX(event."sequence")
  FROM "Event" AS event
  WHERE event."demoRunId" = run."id"
), 0);

CREATE UNIQUE INDEX "Event_demoRunId_sequence_key"
ON "Event"("demoRunId", "sequence");

CREATE UNIQUE INDEX "Event_opportunityId_sequence_key"
ON "Event"("opportunityId", "sequence");

-- Existing replay races may have produced duplicate proof-bearing effects.
-- Preserve the timeline rows but keep proof authority on the earliest event.
WITH ranked_proof_events AS (
  SELECT
    "id",
    ROW_NUMBER() OVER (
      PARTITION BY "demoRunId", "opportunityId", "type", "proofRef"
      ORDER BY "occurredAt", "id"
    ) AS proof_rank
  FROM "Event"
  WHERE "proofRef" IS NOT NULL
)
UPDATE "Event" AS event
SET "proofRef" = NULL
FROM ranked_proof_events
WHERE event."id" = ranked_proof_events."id"
  AND ranked_proof_events.proof_rank > 1;

CREATE UNIQUE INDEX "Event_demoRunId_opportunityId_type_proofRef_key"
ON "Event"("demoRunId", "opportunityId", "type", "proofRef") NULLS NOT DISTINCT
WHERE "proofRef" IS NOT NULL;

-- Render performs rolling deploys: both the previous count-based writer and
-- the new application insert Event rows. Assign the global sequence inside
-- PostgreSQL so every writer version and every opportunity shares one order.
CREATE FUNCTION "assign_demo_run_event_sequence"()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE "DemoRun"
  SET "eventSequence" = "eventSequence" + 1,
      "updatedAt" = CURRENT_TIMESTAMP
  WHERE "id" = NEW."demoRunId"
  RETURNING "eventSequence" INTO NEW."sequence";
  IF NOT FOUND THEN
    RAISE EXCEPTION 'DemoRun % does not exist', NEW."demoRunId";
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "Event_assign_demo_run_event_sequence"
BEFORE INSERT ON "Event"
FOR EACH ROW
EXECUTE FUNCTION "assign_demo_run_event_sequence"();

COMMIT;
