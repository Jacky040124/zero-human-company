# Zero Human Company — Autonomous Lead-Following System

Hackathon project for the **Zero Human Company Hackathon by Terac** (Aug 2026, SF).

An agent-run company that autonomously runs a sales motion end-to-end: buyer discovery → contact ranking → outreach/follow-up → policy-gated negotiation → owner-approved agreement → signature → **a verified Stripe payment flow**. The hackathon run uses Stripe test mode so no live account or real charge is required.

This repo is a deployable monolith: the React/Vite interface is at the root, Fastify and Prisma live in `apps/api`, and shared Zod contracts live in `packages/contracts`. In production Fastify serves both the API and the built interface on one origin.

## Frontend

Vite + React demo of the long-running export agent for Chinese factories.

```
npm install
npm run dev
```

Start PostgreSQL, migrate, and run one deterministic rehearsal:

```sh
cp .env.example .env.local
docker compose up -d postgres
npm install
npm run db:migrate
npm run demo:run
npm run dev
```

Open `/app/dashboard`. When the API is available, the interface switches from its visual fallback to the persisted run and SSE timeline.

## Docs

- **[`docs/BUILD_SPEC.md`](docs/BUILD_SPEC.md)** — the one-shot backend build spec (architecture, schema, contracts, provider matrix, judge-mode rules, definition of done).
- **[`docs/RUNBOOK.md`](docs/RUNBOOK.md)** — local rehearsal, Render Workflow setup, provider gates, and judged sequence.

## Status

- API-backed run state, owner gates, signed webhooks, provider ports, transactional outbox, proof ledger, and strict same-run verification are implemented.
- Local rehearsal is deterministic. Judge mode rejects fake providers and requires real provider configuration.
- Render creates the web service, Postgres, and a single-instance worker hosting three external Band identities backed by Codex/GPT-5.6 Sol. The Workflow service is created once in the Render dashboard because Workflows are not currently supported by Blueprints.
