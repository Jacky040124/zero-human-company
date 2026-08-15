# Hackathon runbook

The judged artifact is one persisted `DemoRun`. Never combine proof from rehearsals.

## Local rehearsal

1. Copy `.env.example` to `.env.local`. Keep real keys out of Git and chat; local API, CLI, Workflow, Prisma, and Band worker commands load this exact root file.
2. Start PostgreSQL with `docker compose up -d postgres`.
3. Run `npm install`, `npm run db:migrate`, then `npm run demo:run`.
4. Run `npm run dev` and open `/app/dashboard`.
5. Repeat the rehearsal three times from fresh runs. Fake proof is amber and cannot pass judge verification.

## Render setup

`render.yaml` creates the same-origin web service, PostgreSQL, and one single-instance background worker for the three external Band agents. Render Workflows currently requires one dashboard setup step:

1. Create a TypeScript Workflow service from this repository.
2. Build with `npm ci && npm run db:generate && npm run build`.
3. Start with `npm run start:workflows -w @zero-human/api`.
4. Share the same environment group and database as the web service.
5. Put the workflow slug in `RENDER_WORKFLOW_SLUG`. The app triggers the six registered named tasks through the official Render SDK.

## External Band agents on Render

Band is the room, identity, message-routing, and audit layer. The three agent brains run in our Render worker:

1. In Band, create three **External** agents named exactly `Researcher`, `Negotiator`, and `Policy Reviewer`.
2. Put each agent's ID and its own API key into the matching `BAND_*_AGENT_ID` and `BAND_*_API_KEY` variables. There is no shared generic Band key.
3. Keep the Render worker at one instance. It opens one persistent WebSocket per identity; a second instance would duplicate connections and can duplicate replies.
4. The web/Workflow side creates a room using a stable task ID, adds all three identities, starts the Researcher with an explicit mention, and accepts only a verdict authored by the Policy Reviewer.
5. Each identity owns a separate persistent Codex thread per Band room using `gpt-5.6-sol`. The thread-ID file and Codex login cache live on the worker's `/var/data` persistent disk. The Docker worker installs Linux `bubblewrap` and writes a deny-by-default Codex permission profile: commands can read only minimal runtime files and the dedicated empty message workspace, while the repository, `.env`, and Codex login cache remain outside the readable boundary. Network and web search are disabled.

For local testing, sign in with Codex on your machine, then run exactly one worker process:

```sh
codex login status
npm run dev:band-agents -w @zero-human/api
```

For Render, open the background worker's shell after its disk exists and authenticate the worker with device code:

```sh
mkdir -p /var/data/codex
CODEX_HOME=/var/data/codex /app/node_modules/.bin/codex login --device-auth
CODEX_HOME=/var/data/codex /app/node_modules/.bin/codex login status
```

Complete the browser/device-code step yourself. Never paste or commit `/var/data/codex/auth.json`; it is equivalent to a password. The checked-in worker configuration uses `BAND_AGENT_BRAIN=CODEX` with `BAND_AGENT_ALLOW_RESPONSES_FALLBACK=false`, so a judged result cannot silently fall back to a different runtime.

## Real-run gates

Keep `JUDGE_MODE=false`, `PROVIDER_MODE=fake`, and `REAL_ACTIONS_ENABLED=false` until setup is complete. Enter credentials directly in root `.env.local` or Render's secret environment group. Do not paste keys into chat.

Run (the commands load root `.env.local` automatically):

```sh
npm run judge:preflight
```

The command prints missing variable names, never values. Once it passes, switch to `JUDGE_MODE=true`, `PROVIDER_MODE=real`, and `REAL_ACTIONS_ENABLED=true`, migrate, and seed exactly one judge run with `npm run demo:seed`.

The two Linq destinations and the Documenso buyer must be consenting role-players. Monid discoveries remain research-only and are never copied into outbound destinations.

## Judged sequence

1. A teammate opens the $5 Stripe test Checkout and completes it with a Stripe test card. This is not an owner action and no money moves.
2. The signed Stripe webhook starts the Render Terac comparison task.
3. Owner approves Terac's winner (owner action 1).
4. Render runs Monid discovery, OpenAI/Linq outreach, and fail-once retry proof in parallel.
5. Nordlicht and Maas role-players reply through Linq. Maas is paused below the EUR 158 floor with no reply.
6. The Nordlicht reply starts the Band task. The three external agents collaborate in Band, and the local policy engine rechecks the resulting price before Linq sends the proposal.
7. A later, explicit Nordlicht acceptance advances the opportunity to agreement and starts the second Terac task for German-law review and the Documenso envelope.
8. Owner signs first in Documenso (owner action 2); the buyer role-player signs second.
9. Verify the exact run:

```sh
npm run demo:verify -- --run-id <demoRunId>
```

The verifier requires a real signed Stripe test-mode event (not a fake fixture), real external IDs for both Terac use cases, Linq, an external-agent Band room and Policy Reviewer verdict, Render retry, Documenso, Monid, and the selected Codex/GPT-5.6 Sol runtime, plus the signed Nordlicht branch, Maas policy pause, and exactly two recorded owner approvals.
