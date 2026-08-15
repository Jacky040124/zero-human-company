# Development handoff: frontend and backend integration

This document is for Jackie and the next coding agent. It describes the backend integration-ready breakpoint as of August 15, 2026 and how to combine it with the newer frontend work safely after Daniel approves the merge.

## Start here

There are two active lines of work in Daniel's fork:

- **Newer frontend:** `main` at `bc9b9e4` (`Polish the demo for judges: simulate onboarding steps and simplify the app area.`).
- **Backend integration seam:** `agent/wip-backend-integration-20260815`. Use its final pushed head from the breakpoint report; it includes the provider implementations, persistence/reconciliation hardening, immutable Band-role routing, shared contracts, and the API seam described below.

Repository: <https://github.com/DanielOu1208/zero-human-company>

The backend code is intended to be complete at the breakpoint; external credentials, signatures, and live-provider evidence remain later operational work. This branch intentionally remains in Daniel's fork. Do not push it directly over Jackie's branch or either repository's `main`.

## Safe integration procedure

Start from a clean working tree. If there are local changes, commit them to their own branch or otherwise preserve them before continuing.

```sh
git fetch https://github.com/DanielOu1208/zero-human-company.git \
  main:refs/remotes/handoff/frontend-main \
  agent/wip-backend-integration-20260815:refs/remotes/handoff/backend-wip

git switch -c integration/frontend-backend handoff/frontend-main
git merge --no-ff handoff/backend-wip
```

Do not merge directly on `main`. Push `integration/frontend-backend` as a separate branch after it builds and the local rehearsal works.

Both branches descend from `f7ed8eb`. A merge analysis performed on August 15 found actual conflict markers in these six files:

- `package-lock.json`
- `src/App.tsx`
- `src/pages/app/AppShell.tsx`
- `src/pages/app/Buyers.tsx`
- `src/pages/app/Dashboard.tsx`
- `src/state/DemoContext.tsx`

`package.json` is changed on both branches but currently merges automatically; review the combined result anyway.

Resolve them by intent, not by accepting one whole side:

1. In `package.json`, verify that the automatic merge retained Jackie's frontend dependency additions, including `recharts`, and the backend workspaces, scripts, and dependencies.
2. After resolving `package.json`, run `npm install` to regenerate `package-lock.json`. Do not hand-edit large lockfile conflict blocks.
3. In `src/App.tsx`, preserve Jackie's routes and keep `DemoProvider` above the routed application so every screen can read runtime state.
4. In `AppShell`, `Buyers`, and `Dashboard`, preserve Jackie's newer layout and visual behavior. Reapply the backend connection points: data from `useDemo()`, API-derived leads/activity, and `RunControl` on the dashboard.
5. Treat `DemoContext.tsx` as the highest-risk conflict. Preserve Jackie's newer scripted/demo behavior, then add the backend fields and effects deliberately: `runtimeRun`, `apiConnected`, `runtimeError`, initial snapshot loading, SSE subscription, and the owner actions. Do not replace this file wholesale with either side.

The backend-only files under `apps/api`, `packages/contracts`, `src/api/runtime.ts`, and `src/components/RunControl.tsx` should normally merge as additions.

## What the backend branch contains

The repository becomes an npm-workspace monolith:

```text
React/Vite UI (repository root)
        |
        | same-origin JSON + server-sent events
        v
Fastify API (apps/api)
        |
        +-- Prisma/PostgreSQL persistence
        +-- provider adapters and signed webhooks
        +-- Render workflow tasks

Shared Zod contracts (packages/contracts)
```

During local development, Vite proxies `/api` and `/webhooks` to Fastify on port `3001`. In production, Fastify serves the built Vite application and the API from the same origin.

### Changes since the first handoff

- Render and the external Band worker were hardened for production dependency installation, persistent Codex authentication, isolated agent workspaces, and strict same-run proof verification.
- Band roles are routed by configured immutable agent IDs rather than display names.
- Band negotiation now uses a deterministic hashed operation marker instead of passing an internal idempotency key as a Band task ID. Reconciliation can recover the room, restore missing participants, avoid resending an existing brief, paginate chat history, and continue polling for the Policy Reviewer verdict.
- Unknown provider outcomes persist a safe external hint and reconciliation receives the original request context. This lets the Band adapter resume instead of blindly repeating an external action.
- Band verdict parsing accepts Band's structured delivery mentions without allowing a mentioned final verdict to start another negotiation turn.
- Sales-draft generation now uses OpenRouter's OpenAI-compatible chat-completions endpoint with `openai/gpt-5.6-luna`, required-parameter routing, and Zod-validated structured output. The provider remains recorded as `OPENAI` in the shared proof model; `OPENROUTER` is recorded in its redacted metadata.
- `demo:verify` reconciles pending Render task intents before running strict proof checks.
- Local commands consistently load root `.env.local`. Render builds explicitly install development dependencies because TypeScript and Vite are required during the build.

Important files:

- `packages/contracts/src/index.ts`: shared runtime schemas and TypeScript types. Change the contract here first when adding API data.
- `src/api/runtime.ts`: the browser's small API client.
- `src/state/DemoContext.tsx`: adapter between API snapshots and the existing frontend presentation model.
- `src/components/RunControl.tsx`: owner sign-in, Stripe activation, campaign approval, and proof/status display.
- `apps/api/src/app.ts`: Fastify composition and production static serving.
- `apps/api/src/routes/demo.ts`: snapshots, proof, verification, SSE, run creation, rehearsal, and campaign decisions.
- `apps/api/src/routes/providers.ts`: Stripe, Linq, and Documenso webhooks plus workflow triggers.
- `apps/api/src/domain/demo-service.ts`: persisted run state and the API snapshot mapping.
- `apps/api/prisma/schema.prisma`: database model.
- `docs/BUILD_SPEC.md`: product invariants and definition of done.
- `docs/RUNBOOK.md`: local rehearsal and deployment/operator steps.

## What is connected today

The browser calls `GET /api/v1/demo-runs/active`. A `404` means no run has been seeded, so the existing visual simulation remains active. A valid response is parsed with the shared `demoRunSnapshotSchema` before it reaches the UI.

Once a run is loaded:

- `EventSource` subscribes to `/api/v1/demo-runs/:id/events`.
- The API sends a full sanitized snapshot every 1.5 seconds.
- Opportunities are mapped into the frontend's lead cards.
- Timeline records become the dashboard activity list.
- `RunControl` shows the run mode/status, proof badges, and pending owner action.
- Owner login uses a signed, HTTP-only, same-site cookie.
- Stripe sandbox checkout creation requires that owner session but does not create a counted approval.
- Campaign approval refreshes the snapshot immediately; subsequent updates arrive through SSE.
- Manual lead messages are blocked by the context while an API-backed run is active.

The shared snapshot carries run status, pilot status, the two-owner-action count, opportunities, timeline entries, and sanitized provider proof. Opportunities include stable database IDs, nullable city, country, stage/reason, and an explicit `researchOnly` flag. It intentionally contains no provider credentials, raw webhook payloads, or persisted message bodies. The exact schema is `demoRunSnapshotSchema` in `packages/contracts`; `/api/v1/openapi.json` documents all stable routes and response fields.

## What is not integrated yet

Do not mistake an API connection for a finished frontend integration:

- The frontend's detailed conversation threads are still scripted presentation data. The API snapshot does not include persisted messages.
- Per-lead autonomy controls and the app-wide autopilot toggle remain local UI state; they do not pause backend workflows.
- The lead-detail live view reduces an API-backed thread to one summary message rather than rendering persisted message history.
- The UI does not expose run creation, fake rehearsal, verification, logout/session inspection, or manual workflow task routes.
- API errors are displayed coarsely. There is no retry control or clear distinction between initial connection failure and SSE reconnection.
- There are backend tests, but no browser-level or component-level tests proving the merged frontend behavior.
- Real provider credentials, account-specific Terac paths, all webhook registrations, human signatures, and a complete judged run have not been verified by this branch.
- Use the breakpoint report for the exact final test/build/migration counts. Automated code evidence is not browser, deployed, signature, or live-provider acceptance.

## Provider decisions already resolved for integration

Jackie's newer `main` also contains:

- `docs/CHECKPOINT_ANSWERS.md`
- `seed/buyer_discovery_seed.json`

Read both during the merge because they were committed after the backend branch split. Where their recommendations differ, these owner-confirmed backend decisions are authoritative:

| Area | Frozen backend decision | Frontend-merge action |
|---|---|---|---|
| Monid | Runtime discovery/inspect/run/status flow; persisted results are PII-redacted and permanently research-only. | Keep the committed seed only as presentation fallback; do not replace live proof with seed data. |
| Stripe | Real Checkout Session in `TEST` mode for $5; only a signed matching sandbox webhook activates the pilot. | Keep “Open test checkout”; do not describe it as live billing. |
| Band | Exactly three external identities on one worker, each backed by Codex subscription threads on `gpt-5.6-sol`; API-backed Responses fallback is removed. | Preserve runtime/provider proof and do not add Claude or OpenAI-key setup. |
| Terac | Campaign study and German-law review use configurable account-specific HTTP paths and fail closed when unavailable. | Do not invent paths or claim live evidence before account-backed validation. |
| Render | Named tasks, Postgres intents/results, retries, leases, and reconciliation. | Preserve the database-backed task/result approach and do not invent a webhook. |

The current outreach configuration is intentionally locked to `OPENROUTER_BASE_URL=https://openrouter.ai/api/v1` and `OPENROUTER_MODEL=openai/gpt-5.6-luna`. Put the key in `OPENROUTER_API_KEY`; the previous `OPENAI_API_KEY` and `OPENAI_MODEL` settings are no longer used for outreach.

Do not reopen these choices during conflict resolution unless Daniel explicitly changes them.

## Recommended continuation order

1. **Merge safely.** Create the integration branch and resolve the six conflicting files using the rules above.
2. **Restore the automated baseline.** Run install, checks, tests, and the production build before changing behavior.
3. **Prove the local seam.** Run PostgreSQL, migrate, create the deterministic rehearsal, start both processes, and verify `/app/dashboard` switches from the visual shell to persisted data.
4. **Adapt the UI to the frozen contract.** Use stable runtime IDs, nullable `city`, `researchOnly`, and the full backend stage enum in `src/api/runtime.ts`/`DemoContext`, then update the views. Request a backend contract change only if a truly required field is absent.
5. **Remove misleading controls.** Either connect autonomy/pause/message controls to explicitly designed backend endpoints or label/disable them in API-backed mode. Do not let a local toggle imply that a real workflow stopped.
6. **Preserve the provider decisions.** Do not replace runtime Monid, Stripe TEST Checkout, or the three external Codex-backed Band identities during frontend conflict resolution.
7. **Add integration tests.** At minimum, cover snapshot parsing, fallback-to-live switching, SSE updates, owner-auth-required behavior, and the final merged dashboard.
8. **Only then perform operational setup.** Follow `docs/RUNBOOK.md`; keep real keys in local/Render secret storage, never Git or chat.

## Validation commands

Use Node.js `22.12` or newer.

```sh
npm install
npm run check
npm run build
```

For the local persisted rehearsal:

```sh
cp .env.example .env.local
docker compose up -d postgres
npm run db:generate
npm run db:migrate
npm run demo:run
npm run dev
```

Then verify:

- `http://localhost:3001/healthz` returns an OK response.
- `http://localhost:5173/app/dashboard` shows the persisted run instead of "Local visual shell".
- Refreshing the page preserves the same run because the source is PostgreSQL.
- The browser receives continuing `snapshot` events from the SSE endpoint.
- `npm run check` and `npm run build` still pass after conflict resolution.

If dependencies or configuration are missing, report that separately from a code failure. Do not claim browser, deployment, provider, or judged-run success from TypeScript/tests alone.

## Safety and product invariants

- Keep `JUDGE_MODE=false`, `PROVIDER_MODE=fake`, and `REAL_ACTIONS_ENABLED=false` during ordinary integration.
- Never commit root `.env.local`, provider keys, Codex authentication files, or raw provider payloads.
- Never paste credentials into an agent conversation.
- Outbound messages may go only to explicitly consenting role-players on the allowlist. Monid/Apollo discoveries are research-only.
- Preserve idempotency: inbound provider events are deduplicated and outbound side effects use stable idempotency keys.
- Preserve one `demoRunId` across every proof-bearing record. Never assemble judged proof from multiple rehearsals.
- Keep the two owner actions distinct: campaign approval and owner-first document signature.
- Treat a passing local rehearsal as fake proof. The strict verifier must reject it for judged-run claims.

## Completion target for the integration branch

The frontend/backend integration branch is ready to share when:

- Jackie's current UI is preserved.
- The dashboard consistently switches between visual fallback and persisted runtime state.
- No visible control falsely claims to affect the backend.
- The package/workspace merge installs from a fresh checkout.
- `npm run check` and `npm run build` pass.
- A local PostgreSQL rehearsal survives a page refresh and streams updates.
- Remaining provider choices and unavailable real-world evidence are documented plainly.
