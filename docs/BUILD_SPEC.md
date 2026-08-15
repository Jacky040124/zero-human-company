# Autonomous Lead-Following System — Backend Build Spec (v2, lightweight)

Status: **approved to start** — foundations locked, remaining decisions are explicit "ask-before-implementing" checkpoints (not pre-answered). Backend only; Jacky owns the frontend. Build with the coding agent and ask the checkpoint questions when you reach them.

Zero Human Company Hackathon (Terac), Aug 15, SF.

---

## 1. What we're building

An agent-run company that runs a toy-factory import/export sales motion end-to-end, inside owner-approved limits:

```
Onboarding → Stripe pilot payment → Terac comparison study → owner approves selected campaign revision (once)
  → autonomous loop (discovery → outreach → Band-gated negotiation → policy gate → agreement)
  → owner approves the binding document (once) → Signed
```

**Exactly two owner actions:** approve the selected campaign revision once; approve the binding document once. Everything else autonomous; policy exceptions auto-pause. The **paid unit is our own pilot activation** (company revenue), charged **before** campaign activation — not a buyer deposit.

The demo is judged on the rubric below; a sponsor claim only counts if one judged run captured its real external ID.

| Prize | Proof (carries `demoRunId`) |
|---|---|
| Terac (MANDATORY) | `HumanStudy`: real human baseline-vs-selected delta |
| Agent-Run Company | `Payment`: live-mode Stripe `checkout.session.completed` |
| Linq | `Message` w/ Linq event id |
| Band | `AgentHandoff` w/ Band room id + schema-valid verdict |
| Render | `WorkflowRun` w/ Render run id + fail-once retry |

---

## 2. Locked foundations (expensive to undo — build these right the first time)

**(1) Stable aggregates — payment lives on a pilot, not a revision/Opportunity:**
```
Workspace 1—1 PilotActivation 1—* Payment
Workspace 1—* Campaign 1—* CampaignRevision      (Campaign.activeRevisionId → CampaignRevision)
Campaign  1—* Opportunity
```
`CampaignRevision.status`: `DRAFT|UNDER_STUDY|READY_FOR_APPROVAL|ACTIVE|SUPERSEDED`. `study.returned` → `READY_FOR_APPROVAL`; only owner approval → `ACTIVE`. Keep `Opportunity.stage=SIGNED` and `PilotActivation.status=PAID` **separate** — "Paid" is not an Opportunity stage.

**(2) `DemoRun`** — one run id; every proof-bearing record (`HumanStudy, AgentHandoff, WorkflowRun, Message, Document, Payment, Approval, Event`) carries `demoRunId` so proof can't be assembled from unrelated rehearsals. Expose `GET /api/v1/demo-runs/:id/proof` (sanitized: provider, external id, live/fake, status, timestamp — no secrets).

**(3) Idempotent side effects — retries must not duplicate real messages/docs/charges:**
- `ProviderEvent` — every inbound webhook, unique on `(provider, externalEventId)`.
- `ProviderAction` (transactional outbox) — created **before** a side effect, unique on internal `idempotencyKey`, states `PLANNED|RUNNING|SUCCEEDED|FAILED`, attempts, provider external id, redacted response.
- One DB txn updates state + appends `Event` (monotonic per-Opportunity `sequence`) + creates the `ProviderAction`. A worker claims the action and passes the idempotency key to the provider. Add `Opportunity.version` optimistic lock so concurrent callbacks can't double-advance. This is what makes Render retries safe.

**(4) Every external service behind an interface** — `ProviderPort` (send + capabilities), `WorkflowPort` (Local for skeleton/CI, Render for judged), `ModelProvider` (OpenAI baseline; Pioneer optional, never removed as fallback), `PolicyEngine` (pure). The coding agent implements fakes first, then asks the checkpoint questions (below) before wiring each real provider.

Minimal seed: toy Offer, one Campaign + baseline revision, 5 buyers, 2 contacts, recipient allowlist.

---

## 3. Build order

1. **Walking skeleton on `LocalWorkflowRunner`:** schema + seed + state machine + one `lead.discovered` event advancing a seeded Opportunity, exposed via `GET /api/v1/opportunities/:id/timeline`. No real provider yet.
2. Policy gate + one specialist (in-policy auto-send; out-of-policy → Approval; opt-out stops).
3. Real providers one at a time behind their ports, each gated by an ask-before-implementing checkpoint.
4. Harden: `demo:verify --run-id` (fails unless one run has every real proof), kill switch, run 3× clean.

Scripts: `pnpm check | db:reset | demo:seed | demo:run | judge:preflight | demo:verify --run-id <id>`.
Modes: `JUDGE_MODE=true` requires real config + provider preflight (incl. Linq/Monid) and rejects local engine + fakes; `REAL_ACTIONS_ENABLED=true` limits side effects to the consenting-recipient allowlist. Never message addresses from real buyer research — outbound goes to allowlisted demo role-players.

---

## 4. Ask-before-implementing checkpoints (decide with chalk/team at integration time)

Do NOT hard-code these now — surface them as questions when you reach each integration:
- **Band topology:** platform agents (Render workflow creates room, polls until schema-valid `NegotiationVerdict`) vs a persistent `band-gateway` SDK/WebSocket worker. MCP alone can't receive agent replies. Pick one before writing Band code.
- **Terac:** transport (MCP vs HTTP), study shape (recommended: one blind comparative study rating baseline + candidates on the same clarity/trust/relevance rubric; activate the human-selected winner after owner approval), and that human latency can't block the 3-min demo (launch early, show stored authenticated result).
- **Owner auth:** seeded owner + signed HTTP-only session, or static bearer token (no unauthenticated mutations).
- **API naming / DTOs:** confirm route names + the timeline DTO (`sequence, type, status, sanitized summary, actor, occurredAt, proofRef`); emit an OpenAPI doc for the frontend.
- **Stripe:** live-mode Payment Link + `client_reference_id=<pilotActivationId>`, raw-body signature, `checkout.session.completed`, store `stripeEventId/checkoutSessionId/paymentIntentId/livemode/amount/currency`.
- **Monid:** confirm runtime vs **pre-run import** (recommended: operator runs `monid discover/inspect/run` for demo queries and seeds real Monid run/provider ids into `Company.monidProviderId`; this runtime has no autonomous Render-side key by default). Don't claim autonomous runtime discovery unless provisioned.
- **Provider accounts (human, not code):** Stripe live acct + Payment Link, Terac study access, Band agents, Linq number + webhook, Documenso account + template + webhook secret, Render Workflows enabled + task slugs. Each yields a non-secret id + a preflight check.

---

## 5. Definition of done (core)

Fresh env seeds from one command; two owner approvals only; **real human-measured Terac delta** stored; **real live Stripe payment → PilotActivation PAID**; Band verdict gates negotiation; policy visibly blocks an unsafe action; all signatures → Signed once; judged run on Render with a real `WorkflowRun` + fail-once retry; `demo:verify --run-id` passes on one run; four negative tests pass (remove Terac → revision can't activate; remove Band verdict → negotiation can't start; replay Stripe webhook → no duplicate revenue; fail a Render task → retry no duplicate side effect). Pioneer/Fastino is optional and NOT in this DoD.

---

*A deeper fully-specified reference (exact Prisma, provider callback/auth rules, full route table + Zod, env matrix, external-setup checklist) exists and can be dropped in if the coding agent wants more determinism on any section — ask 龙虾.*
