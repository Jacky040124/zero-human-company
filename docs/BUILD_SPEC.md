# Autonomous Lead-Following System — Build Spec (v3, implementation baseline)

Status: **implemented locally** — foundations and integration decisions are locked. Real provider credentials, account-specific paths, Render provisioning, and the judged run remain operational setup.

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
| Agent-Run Company | `Payment`: signed Stripe test-mode `checkout.session.completed` with an explicit provider mode |
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

**(4) Every external service behind an interface** — `ProviderPort` (send + capabilities), Render Workflows for judged execution, OpenRouter-routed `openai/gpt-5.6-luna` with structured output for sales copy, three external Band identities backed by persistent Codex SDK threads on `gpt-5.6-sol`, and a pure local `PolicyEngine`.

Minimal seed: toy Offer, one Campaign + baseline revision, 5 buyers, 2 contacts, recipient allowlist.

---

## 3. Build order

1. **Walking skeleton on `LocalWorkflowRunner`:** schema + seed + state machine + one `lead.discovered` event advancing a seeded Opportunity, exposed through the run snapshot and SSE endpoints. No real provider yet.
2. Policy gate + one specialist (in-policy auto-send; out-of-policy → Approval; opt-out stops).
3. Real providers one at a time behind their ports, each gated by an ask-before-implementing checkpoint.
4. Harden: `demo:verify --run-id` (fails unless one run has every real proof), kill switch, run 3× clean.

Scripts: `npm run check | db:reset | demo:seed | demo:run | judge:preflight | demo:verify -- --run-id <id>`.
Modes: `JUDGE_MODE=true` requires real config + provider preflight (incl. Linq/Monid) and rejects local engine + fakes; `REAL_ACTIONS_ENABLED=true` limits side effects to the consenting-recipient allowlist. Never message addresses from real buyer research — outbound goes to allowlisted demo role-players.

---

## 4. Locked integration decisions

- **Band topology:** External Researcher, Negotiator, and Policy Reviewer identities connect to Band from one single-instance Render worker. A named Render task creates an idempotent room, explicitly mentions the Researcher, and polls for a Policy Reviewer-authored verdict. Each role has a separate persistent Codex SDK thread on GPT-5.6 Sol; the local price policy remains authoritative.
- **Terac:** two real tasks: baseline plus two campaign candidates on clarity/trust/relevance, and a German-law contract review. Account-specific HTTP paths are configuration, not guessed constants.
- **Owner auth:** seeded owner credentials create a signed, secure, HTTP-only, same-site cookie.
- **API:** REST snapshot plus SSE updates, shared Zod DTOs, and an OpenAPI surface at `/api/v1/openapi.json`.
- **Stripe:** a real test-mode Checkout Session for exactly $5 USD. Only a signed, matching Stripe webhook marks the pilot paid; in-memory/fake provider data never qualifies.
- **Monid:** runtime discovery on Render. Results are permanently marked research-only and are never promoted into outbound recipients.
- **Render:** same-origin web/API plus Postgres, and a separate Workflow service registering named TypeScript tasks. The fail-once task proves managed retry without duplicate side effects.
- **Documenso:** template-backed sequential envelope, owner first and consenting buyer role-player second.

---

## 5. Definition of done (core)

Fresh env seeds from one command; two recorded owner approvals only; **real human-measured Terac delta** and **real German-law Terac review** stored; **signed Stripe sandbox payment → PilotActivation PAID**; Band verdict gates negotiation; policy visibly blocks an unsafe action; all signatures → Signed once; judged run on Render with a real `WorkflowRun` + fail-once retry; `demo:verify -- --run-id` passes on one run; and the negative idempotency/state tests pass.

---

*A deeper fully-specified reference (exact Prisma, provider callback/auth rules, full route table + Zod, env matrix, external-setup checklist) exists and can be dropped in if the coding agent wants more determinism on any section — ask 龙虾.*
