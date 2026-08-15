# §4 Checkpoint Pre-Answers

For the coding agent: recommended answers to the ask-before-implementing checkpoints in `BUILD_SPEC.md §4`, so you don't stall. Each item is labeled:
- **[VERIFIED]** — confirmed from provider docs; safe to implement as an API contract.
- **[TEAM-CHOICE]** — a decision, not a fact; use the recommendation but confirm with @chalk before locking.
- **[NEEDS-ACCOUNT]** — depends on account/provisioning state; confirm the real id/preflight with whoever provisions it.

---

### Discovery / Monid — [VERIFIED, by our own run]
Use the **pre-run import** already committed at `seed/buyer_discovery_seed.json` (real Apollo companies via Monid, `monidRunId=01M03B83EC2T4AH2RJPSXXWKZ9`). Do **not** attempt autonomous Monid discovery from the Render backend — Monid is a CLI (`discover→inspect→run`) with the key in Jacky's local vault, not provisioned server-side. Store each `apolloOrgId` as `Company.monidProviderId`; the run id is the discovery proof. If live runtime discovery is later wanted, it needs `MONID_API_KEY` on Render + a chosen inspected endpoint — treat as stretch.

### Stripe — [VERIFIED]
One reusable **Payment Link**; the backend appends `?client_reference_id=<pilotActivationId>` when handing the link to the customer (do NOT bake a pilot id into the dashboard link). Verify the webhook signature over the **raw request body**; handle `checkout.session.completed`; assert `livemode=true`; store `stripeEventId, checkoutSessionId, paymentIntentId, livemode, amount, currency`; dedupe on `stripeEventId`. `client_reference_id` is returned on the completed session.

### Band — [VERIFIED mechanism / TEAM-CHOICE topology]
MCP **cannot** receive agent replies — do not build the collaboration on MCP alone. Two executable topologies; **recommend platform agents**: a Render task creates the room, adds/mentions Researcher+Negotiator+Policy Reviewer, and **polls** until a schema-valid `NegotiationVerdict` appears; `bandRoomId` mandatory, workflow can't advance without the verdict. Alternative = a persistent `band-gateway` SDK/WebSocket worker (a 2nd deployed process; exempt it from "no microservices" if used). Pick one with @chalk before writing Band code.

### Terac — [NEEDS-ACCOUNT + TEAM-CHOICE]
Confirm transport (MCP vs HTTP) and the returned study schema once study access exists. Recommended shape: **one blind comparative study** rating baseline + candidate messages on the same clarity/trust/relevance rubric; ingest the real completed result; owner approves the human-selected winner. Human latency must not block the 3-min demo — **launch early, demo the stored authenticated result**. Store `teracStudyId, baselineRevisionId, candidateRevisionIds[], selectedRevisionId, per-variant scores, sampleSize, comments, delta`.

### Documenso — [VERIFIED]
Real Documenso Cloud/API document (don't assume a separate "sandbox" unless confirmed). Verify `X-Documenso-Secret` with a **constant-time** compare; make `COMPLETED` monotonic/idempotent.

### Linq — [VERIFIED]
`capabilities` check before send; verify Standard-Webhooks signature over raw body; dedupe on `event_id`; return 2xx fast then queue; recipient must be on the allowlist. Assume at-least-once delivery.

### Render Workflows — [VERIFIED]
Define task slugs + task input/result Zod schemas; the Next app starts runs; **the task writes its result to Postgres** — do NOT add a Render webhook unless the API provides one. No native scheduling → follow-up timers = a small cron-triggered task. Prove idempotent retry with one controlled **fail-once** task → `WorkflowRun.retryProven=true` + real `renderRunId`.

### Owner auth — [TEAM-CHOICE]
Recommend: seeded owner + **signed HTTP-only session cookie** (or a static bearer token for speed). No unauthenticated mutation endpoints. Confirm the choice with @chalk.

### API naming / DTOs — [TEAM-CHOICE]
Use the route list in `BUILD_SPEC.md §ask-before` and emit an **OpenAPI 3.1** doc so the frontend integrates without reading backend code. Timeline DTO: `{ sequence, type, status, summary /*sanitized*/, actor, occurredAt, proofRef? }` — never raw provider payloads. Confirm exact names with Jacky (frontend) so both sides match.

### Provider accounts — [NEEDS-ACCOUNT]
Each of Stripe(live)/Terac/Band/Linq/Documenso/Render must end with a non-secret id + a passing preflight. @chalk is provisioning these; also recruit the **consenting humans** first — one real pilot payer + one Linq buyer role-player — since accounts are useless in the judged run without them.
