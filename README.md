# Zero Human Company — Autonomous Lead-Following System

Hackathon project for the **Zero Human Company Hackathon by Terac** (Aug 2026, SF).

An agent-run company that autonomously runs a sales motion end-to-end: buyer discovery → contact ranking → outreach/follow-up → policy-gated negotiation → owner-approved agreement → signature → **real revenue via Stripe**.

This repo is a **monolith**: frontend demo at the root, backend spec in `docs/`.

## Frontend

Vite + React demo of the long-running export agent for Chinese factories.

```
npm install
npm run dev
```

Click path: Landing → Catalog → Offer → Outreach → Audience → Access → Buyers → Lead → Contract.

## Docs

- **[`docs/BUILD_SPEC.md`](docs/BUILD_SPEC.md)** — the one-shot backend build spec (architecture, schema, contracts, provider matrix, judge-mode rules, definition of done).

## Status

- Frontend demo is in-repo (landing, onboarding, buyers, contracts).
- Backend spec is **v2 (lightweight), approved to start** — four foundations locked, remaining decisions are explicit ask-before-implementing checkpoints.
