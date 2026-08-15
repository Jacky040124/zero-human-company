> **STATUS: DRAFT v1 — pending architecture review by Karina.** An approved, backend-focused v2 will replace this file. Use this for repo setup and orientation; do not freeze contracts against it until v2 lands.

# Autonomous Lead-Following System — One-Shot Build Spec (v1, ready to review)

Status: Finalized for review. Zero Human Company Hackathon (Terac), Aug 15.
Authors: 龙虾 (spec) incorporating Karina's architecture decisions; review gate = Karina (consistency, contracts, one-shot executability, every sponsor claim *proven not named*).
Use: feed this whole document to one coding agent as a single build brief. Stack, schema, contracts, demo path, judge-mode rules, and definition of done are all fixed here.

Decision provenance: rubric corrections (龙虾) + forks 1–8 (Karina) + locks A/B (龙虾+Karina) + WorkflowPort/JUDGE_MODE guards (Karina).

---

## 0. Winning = the rubric (build toward this table, not toward completeness)

One-day event, judged on specific criteria. Every phase exists to make one judge-visible moment real. **A sponsor claim only counts if it is PROVEN (real external ID captured), not merely named.**

| Prize / requirement | Judge must SEE | Proven by (record) | Priority |
|---|---|---|---|
| **Terac MCP (MANDATORY)** | Real human study improves campaign messaging, visible **before→after + score delta** | `HumanStudy` row w/ Terac study id + v1→v2 diff | **P0** |
| **Agent-Run Company ($2,500)** | A **real Stripe payment settles** during the event | `Payment` row w/ Stripe id, status=Paid | **P0** |
| **Best Overall Project ($2,500)** | Whole autonomous loop + legible timeline | full run | **P0** |
| **Linq ($1,500/$1,000)** | Agent sends/receives on a real number (or calls) | `Message` w/ Linq external id | **P1** |
| **Band ($500)** | Band is **load-bearing**: no room → negotiation cannot start | `AgentHandoff` w/ Band room id + `NegotiationVerdict` | **P1 (all-or-nothing)** |
| **Render ($500/$300/$100)** | Uses **Render Workflows** (not just hosting) | `WorkflowRun` w/ Render run id + retry evidence | **P1** |
| **Superserve ($1,000/$500)** | Agents execute code/browse in Superserve sandboxes | optional wrapper | P2 |
| **Replay ($1,000/$500)** | Clean QA report after fixing found bugs | Phase 9 | P2 |
| **Pioneer/Fastino ($500)** | Fine-tuned open model powers a real feature | Negotiator via `ModelProvider=pioneer` | P2 |

Two corrections from the original plan, now baked in: **Terac is mandatory** (was cut 2nd), and the loop ends at **Paid**, not just Signed.

---

## 1. Product

A generic **autonomous lead-following company**. Demo vertical only: a **toy factory** selling a catalog to wholesale buyers (import/export sales). Agents run the deal inside owner-approved limits:

```
Offer/catalog → Campaign approval (once) → discovery → contact ranking →
outreach/follow-up → negotiation (Band-gated) → owner-approved agreement → all signatures → SIGNED
        ‖ (company revenue, real) → paid pilot activation → PAID
```

In-scope: discovery → signed agreement, plus our own paid pilot activation as the real revenue event. Non-goals: fulfillment, logistics, post-sale, multi-vertical.

**Zero-human framing:** default path autonomous inside pre-approved campaign limits. Owner appears at exactly **two** beats (approve campaign once; approve exact binding document). Everything else autonomous; policy exceptions pause automatically.

**Paid unit (lock A):** the real charge is a **paid pilot activation** — a consenting customer pays *our* agent-run company to run their sales. This is our company's own revenue → cleanest reading of "the company earned revenue," and avoids collecting a toy-buyer's funds (client-funds/KYC/accounting risk on a same-day Stripe individual account). Buyer-side deposit is **out of scope**. NOTE FOR REVIEW: this refines Karina's decision 1 — `Payment`/`PaymentPending→Paid` attaches to the **pilot activation (Workspace/CampaignRevision)**, demoed right after the Signed beat, not to a buyer deposit on the Opportunity.

---

## 2. Demo storyboard (3-min, judge-facing — build backward from this)

1. **Onboarding** — Owner uploads toy Offer, sets policy limits + call mode=agent, approves Campaign once. *"Approve once, then it runs itself."*
2. **Terac before→after (MANDATORY beat)** — system generates **Campaign Revision v1** messaging; Terac MCP recruits a **general-population study** scoring clarity/trust/relevance + comments; results ingested → **Revision v2**; UI shows exact edits + **score delta**; Owner launches v2. → Terac.
3. **Discovery + ranking** — 5 buyer companies via **Monid** (real); score contacts; pick primary+backup with reasons. → Best Overall Project.
4. **Autonomous outreach** — agent sends first message on a **real Linq** number; buyer replies. → Linq.
5. **Band-gated negotiation (load-bearing)** — Opportunity cannot move **Engaged→Negotiating** until a **Band room** yields a validated `NegotiationVerdict`: Researcher supplies buyer evidence → Negotiator adapts the proposal from that evidence → Policy Reviewer can block. No room/verdict → **Paused**. → Band.
6. **Policy gate (safety, on-screen)** — buyer asks a discount outside range; deterministic policy **blocks** auto-send, creates an **Owner Approval**. *"Model proposed, code refused."*
7. **Agreement + signature** — Document specialist fills a pre-approved template from the term ledger; Owner approves the exact version; **Documenso** (sandbox) sends; last signature → **Signed**.
8. **Stripe payment (money beat)** — a consenting customer pays the **pilot activation fee**; real **Stripe** charge settles → **Paid**, visible in timeline + Stripe dashboard. → Agent-Run Company.
9. **Timeline** — throughout, Opportunity detail shows every event, decision, policy verdict, human study, handoff, and cost. *This screen is the demo.*

Kill switch ON outside the scripted run so no real person is messaged/charged unintentionally.

---

## 3. Architecture & stack (locked)

- **App:** one Next.js (App Router) + TypeScript repo. Tailwind + shadcn/ui. No microservices.
- **DB:** Postgres + Prisma (on Render). Canonical state + append-only audit.
- **Durable engine — `WorkflowPort` (Render Workflows in the judged run):**
  - `LocalWorkflowRunner` — dev + CI + the P0 walking skeleton (deterministic, in-process).
  - `RenderWorkflowRunner` — judged/staging/prod path. One event-triggered Render task per Opportunity step: read Postgres state → run bounded action → write events/state → return. Buyer replies, approvals, Band verdicts, Terac results, signatures, and Stripe webhooks each trigger a task run; survives idle with no permanent worker. Render Workflows has retries + long-running tasks but **no native scheduling**, so follow-up timers = a small cron-triggered task.
  - Same `WorkflowPort` input/output schemas for both. Future production swap (Inngest, richer multi-day waits) sits behind the same port.
  - **Build-safety:** P0 skeleton runs on `LocalWorkflowRunner`; Render Workflows is a Phase-8-style integration swap — Checkpoint 1 does not block on it.
- **`JUDGE_MODE=true`** (the submitted run) **rejects at startup**: `WORKFLOW_PROVIDER=local`, and fake Terac / Band / Stripe / Documenso providers. Provider outages may be *rehearsed* with fakes, but the submitted run must capture real external IDs in `WorkflowRun`, `HumanStudy`, `AgentHandoff`, `Payment`, `Document`.
- **Model calls — `ModelProvider` interface:** OpenAI Responses API = committed baseline, every output **Zod-validated**. Pioneer/Fastino import-export fine-tune = typed adapter; if the fine-tune team ships a working endpoint+schema before plan lock, route the **Negotiator** through it, **never remove the OpenAI fallback** (lock B).
- **Deterministic policy code:** the only thing returning allow/block/needs_approval. Model never grants authority or calls a provider directly.
- **Provider adapters:** every integration has `fake` + `real` modes by env; core is provider-agnostic (but see `JUDGE_MODE`).
- **Coordination — Band:** the negotiation handoff (§2.5) routes through a Band room and is load-bearing. Fake mode = in-process bus for tests only.

---

## 4. Repo structure

```
app/
  api/            # webhooks + endpoints: linq, resend, documenso, stripe, terac, band, render
  onboarding/     # Offer + campaign setup + policy limits + call mode
  opportunities/  # pipeline list + opportunity detail (timeline)
  campaign/       # v1→v2 review (Terac before/after)
lib/
  db/             # Prisma client + queries
  domain/         # entities, state machine, policy engine
  workflow/       # WorkflowPort + LocalWorkflowRunner + RenderWorkflowRunner
  agents/         # specialist calls (Zod-validated) + ModelProvider (openai|pioneer)
  coordination/   # Band bus (real + fake), NegotiationVerdict
  providers/      # discovery | messaging | signature | payment | humanExpert adapters
  events/         # DomainEvent envelope + validation + dedup
  demo/           # fixtures + scenario runner + kill switch + judgeMode guard
prisma/schema.prisma
tests/ unit/ integration/ e2e/
.env.example      # NAMES ONLY, never secrets
```

Gates before feature work: format, lint, typecheck, unit test, one browser e2e command, single `check` script. **Setup DoD:** clean checkout runs fully on `LocalWorkflowRunner` + fake providers, zero sponsor credentials.

---

## 5. Data model (Prisma)

Entities: `Workspace, Offer, CampaignRevision, Company, Contact, Opportunity, Message, Approval, Document, Payment, Event` + four first-class additions: **`HumanStudy`, `AgentHandoff`, `WorkflowRun`**, and `Payment` (already listed).

Invariants:
- every record carries `workspaceId`.
- every `Opportunity` pins the exact `campaignRevisionId` + `callMode` it started with.
- `Event` append-only; every state change + external action emits one.
- external ids unique on `Message/Document/Payment/HumanStudy/AgentHandoff/WorkflowRun` → duplicate webhooks/retries cannot act twice.
- `HumanStudy`: campaignRevisionId(v1), Terac study id, scores(clarity/trust/relevance), comments, resulting campaignRevisionId(v2), diff. (before→after evidence.)
- `AgentHandoff`: opportunityId, Band room id, participants, `NegotiationVerdict` (proposal, cited evidenceIds, policyDecision). Engaged→Negotiating requires a valid one.
- `WorkflowRun`: provider (`local|render`), Render run id, step, attempt, status, side-effect keys. (Render load-bearing evidence.)
- `Payment`: subject (`pilot_activation`), Stripe checkout/payment id, amount, currency, status (`pending|paid|failed`).

Seed: one toy Offer, one approved CampaignRevision(v1), five buyers, two contacts for the primary demo company.

---

## 6. State machine + event contract

```
Researching → Outreach → Engaged → Negotiating → Agreement → Signing → Signed
```
`Lost`/`Paused` allowed from relevant states. `Engaged→Negotiating` is **gated on a valid `NegotiationVerdict`** (else `Paused`). Company revenue: `Payment: pending → paid` (pilot activation), demoed right after Signed; not an Opportunity sub-state.

Envelope:
```ts
type DomainEvent = {
  id: string; workspaceId: string; opportunityId?: string;
  type: string; occurredAt: string;
  source: "app"|"timer"|"provider"|"owner"|"expert";
  externalId?: string; payload: unknown;
}
```
Handler: validate → reject/ignore duplicates → load only the named Opportunity → compute allowed transition → persist result + next wake-up → stop.
Events: `lead.discovered, message.received, followup.due, study.requested, study.returned, handoff.completed, owner.approved, document.approved, signature.completed, payment.completed, contact.opted_out`.

---

## 7. Policy engine (model proposes, code decides)

Deterministic `allow|block|needs_approval`: `canContactCompany, canSendMessage, canFollowUp, canUseContact, canAcceptTermChange, requiresOwnerApproval, canSendDocument, canRequestPayment`.
Model may only emit `ProposedAction { action, rationale, evidenceIds[], payload, confidence }` where action ∈ send_message|request_call|propose_terms|request_approval|request_study|request_payment.
Safe defaults: one active contact/company; stop on opt-out; no unsupported claims; no term outside CampaignRevision range; no final doc without owner approval; agent never signs; outreach + tool-spend caps; **no real payment above demo cap without owner approval**.

---

## 8. Agent specialists (narrow, Zod-validated, evidence-cited)

`researchCompany, qualifyCompany, extractBuyerMessage, proposeNegotiationAction, draftBuyerResponse, draftAgreementFields`. No general "CEO agent." Each logs prompt version/model/latency/tokens/result; falls back to owner review on repeated validation failure. `proposeNegotiationAction` runs inside the Band handoff and may use the Pioneer model when available.

---

## 9. Provider matrix — what's REAL in the judged run

| Capability | Provider | Judged mode | Proof record |
|---|---|---|---|
| Discovery/enrichment | **Monid** (Apollo/Exa/Places) | REAL (seeded fake fallback for rehearsal) | provider ids on Company/Contact |
| Human expert study | **Terac MCP** | **REAL (mandatory)** | `HumanStudy` |
| Messaging email | Resend | real, fake fallback | `Message` |
| Messaging/call | **Linq** | **REAL** | `Message` (Linq id) |
| Signature | Documenso sandbox | REAL in judged run, fake = rehearsal only | `Document` |
| **Payment** | **Stripe (individual)** | **REAL** | `Payment` |
| Coordination | **Band** | **REAL (load-bearing)** | `AgentHandoff` |
| Engine | **Render Workflows** | **REAL** | `WorkflowRun` |
| Sandbox (bonus) | Superserve | optional | — |
| QA | Replay | Phase 9 | report |
| Model (bonus) | Pioneer/Fastino | optional adapter | model log |

Every provider: verify webhook signatures where supported; normalize at boundary; store raw event (secrets redacted); ack fast then queue; dedupe on external id. `JUDGE_MODE` forbids fakes for Terac/Band/Stripe/Documenso/engine.

---

## 10. Build order (one-shot phases)

- **P1 Walking skeleton (60–90m)** on `LocalWorkflowRunner`: schema + seed + state machine + one workflow step + policy gate + fake message/reply + timeline UI. *Checkpoint 1.* No real integration until green.
- **P2 Policy + one specialist (60m):** extract + propose; in-policy auto-send; out-of-policy → Approval; opt-out stops. *Checkpoint 2.*
- **P3 UI (45m):** onboarding, campaign v1→v2 review, opportunity list, opportunity detail/timeline.
- **P4 Discovery via Monid (30–45m).**
- **P5 Band load-bearing negotiation (30–45m):** NegotiationVerdict gate; prove remove-room → negotiation cannot start.
- **P6 Terac before→after (45–60m):** v1 → Terac study → v2 + delta; persist `HumanStudy`. **+ Linq moment** (parallel).
- **P7 Signature (45m):** Documenso sandbox; owner approves exact version; last signature → Signed.
- **P8 Stripe pilot activation (45m):** real checkout → `payment.completed` → Paid; owner-capped. **+ swap `LocalWorkflowRunner`→`RenderWorkflowRunner`** and capture a real `WorkflowRun` id + retry evidence.
- **P9 Hardening + Replay (90–120m):** one-command reset/reseed; scenario runner; visible timestamps + costs; kill switch; `JUDGE_MODE` startup checks; run full path 3× clean; backup video; Replay QA + fix.

---

## 11. Tests (essentials) + the four decisive negative tests

Unit: transitions, policy decisions, term ranges, opt-out, schema validation, before→after delta calc.
Integration: migrate-from-empty, workspace isolation, append-only Events, unique external ids, campaign/call-mode pinning.
Workflow: qualified→Outreach; reply→Engaged; verdict gate; out-of-policy→Approval; opt-out stops; study.returned activates v2; signature→Signed; payment→Paid; idempotency.
Browser e2e (fake providers, deterministic): onboard → v1→v2 → discover → open Opp → reply → Band verdict → policy block → approve doc → signatures → payment → Signed+Paid timeline.

**Four negative tests that prove load-bearing (Karina):**
1. remove Terac feedback → campaign v2 cannot activate.
2. remove the Band verdict → negotiation cannot start.
3. replay a Stripe webhook → revenue does not duplicate.
4. fail a Render task → retry does not duplicate side effects.

---

## 12. Seed fixtures

Toy Offer (verified materials/safety claims, currency, MOQ, capacity/lead time, allowed price/discount range, one forbidden unsupported claim, one document template). Five buyers (strong+verified; strong+wrong contact; weak; duplicate; qualified-no-contact). Conversations (in-policy price; out-of-policy discount; ambiguous→study; opt-out; redirect). Signature (reject; approve exact; first signer; last signer; duplicate webhook). Payment (checkout created; paid; duplicate webhook).

---

## 13. Definition of Done (rubric-complete)

- fresh env seeded from one command; one Offer + approved Campaign → Opportunity;
- **Terac before→after shown w/ measurable delta + stored `HumanStudy` (MANDATORY);**
- discovery real via Monid; contact ranking selects+explains primary/backup; one active contact;
- **Band negotiation gated by a real `AgentHandoff` verdict (remove room → cannot start);**
- policy visibly blocks an unsafe action; owner approves exact exception/document;
- all required signatures → Signed exactly once;
- **real Stripe pilot-activation payment settles → Paid (Stripe dashboard + `Payment`);**
- **judged run on `RenderWorkflowRunner` with real `WorkflowRun` id + retry evidence;**
- `JUDGE_MODE=true` rejects local engine + fake Terac/Band/Stripe/Documenso at startup;
- full fake-provider e2e passes; all four negative tests pass; kill switch prevents unintended real actions;
- full path runs 3× clean; backup recording exists.

---

## 14. Protected vs cuttable

**Never cut:** event timeline, policy gate, state machine, owner approval, Signed transition, **Terac before→after**, **Stripe payment**, **Band load-bearing verdict**, **Render Workflows judged run**.
**Cut first (rehearsal fakes only, never in JUDGE_MODE):** live Linq *voice* (fall back to Linq messaging), multi-source discovery (Monid-only/seeded), continuous campaign replenishment, campaign-learning UI beyond v1→v2, Superserve, deep e-sign UI.

---

## 15. How to one-shot this

Feed this document as the build brief. First task: **repo + Prisma schema + seed + one `lead.discovered` event that advances a seeded Opportunity, rendered with its timeline, on `LocalWorkflowRunner`** — before any sponsor integration. Then execute the Phase order, swapping each fake for a real provider and finally the local engine for Render Workflows. Build toward the §2 storyboard; measure done by §13; prove every sponsor claim with the record in §0.
