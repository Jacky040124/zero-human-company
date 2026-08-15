-- Historical ProviderAction rows have no durable proof of which adapter ran.
-- Keep the earlier false backfill fail-closed rather than inferring live proof
-- from run mode, status, or an external ID.
BEGIN;

LOCK TABLE "Payment" IN SHARE ROW EXCLUSIVE MODE;

UPDATE "Payment" AS payment
SET "providerMode" = CASE
  WHEN run."mode" = 'FAKE'
    OR payment."stripeEventId" LIKE 'evt_fake_%'
    OR payment."checkoutSessionId" LIKE 'cs_fake_%'
    THEN 'FAKE'::"PaymentProviderMode"
  WHEN payment."livemode" = true THEN 'LIVE'::"PaymentProviderMode"
  ELSE 'TEST'::"PaymentProviderMode"
END
FROM "DemoRun" AS run
WHERE payment."demoRunId" = run."id"
  AND payment."providerMode" IS DISTINCT FROM CASE
    WHEN run."mode" = 'FAKE'
      OR payment."stripeEventId" LIKE 'evt_fake_%'
      OR payment."checkoutSessionId" LIKE 'cs_fake_%'
      THEN 'FAKE'::"PaymentProviderMode"
    WHEN payment."livemode" = true THEN 'LIVE'::"PaymentProviderMode"
    ELSE 'TEST'::"PaymentProviderMode"
  END;

COMMIT;
