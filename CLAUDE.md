# Ticketing System — 48h Hackathon

## Project purpose (read this first)
This is a learning project. The goal isn't only to ship the app — it's to build the user's
skill at using Claude Code, and to practice good workflows and modern best practices for
building software from scratch with an AI pair. Optimize decisions for that dual goal, not
just for the fastest path to working code.

**After each prompt/turn, give the user:**
- Recommendations on the approach just taken (what could be done better, alternatives worth knowing about).
- An outside, honest assessment of how effectively they are using Claude Code and directing
  the workflow this turn — not empty praise; call out real mistakes, inefficiencies, or missed
  opportunities (e.g. skipped verification, vague prompts, working around a tool instead of
  understanding it, not using the plan/TDD/review skills when they'd have helped).

## Source of truth
- Requirements: docs/spec.md (cite section numbers when justifying decisions)
- Task list: docs/PLAN.md — check off tasks as they complete; never silently reorder
- API contract: docs/openapi.yaml — both frontends conform to it; change it deliberately
- Architecture decisions: docs/DECISIONS.md — ADRs for anything not unambiguously specified
- Topology/ports/env + auth flow diagram: docs/ARCHITECTURE.md
- Prisma schema draft + integrity rules: docs/DATA_MODEL.md (authoritative copy: backend/prisma/schema.prisma once it lands)
- Onboarding + manual test steps: README.md

## Stack
React+Vite SPA (frontend/), Express+Prisma+Zod API (backend/), PostgreSQL,
cookie sessions, Argon2id, nodemailer→Mailpit. Angular twin in frontend-angular/ (stretch).
Prisma is pinned to v6 (v7 is a breaking rearchitecture — install with `@6`).

## Services & ports
frontend nginx 8080 (serves SPA, proxies /api → backend:3000), backend 3000,
postgres 5432 (app/app/ticketing), mailpit 8025 UI + 1025 SMTP, angular stub 8081 (profile "angular").

## Commands
- Full stack (prod): docker compose up --build        (open http://localhost:8080; no hot reload)
- Health check:      curl localhost:8080/api/health   (→ {"status":"ok"})
- Frontend dev:      cd frontend && npm run dev        (HMR on http://localhost:5173; proxies /api → :3000)
- Backend dev:       cd backend && npm run dev         (tsx watch on :3000; needs db+mailpit)
- Dev infra:         docker compose up -d db mailpit backend  (then run frontend/backend on host as needed)
- Backend tests:     cd backend && npm test
- E2E:               npx playwright test
- New migration:     cd backend && npx prisma migrate dev --name <name>

Dev mode (hot reload): run infra in Docker, apps on the host. Vite (:5173) proxies /api to the
backend (:3000), matching nginx in prod. Port 8080 is the prod build only — no reload. See README.

**Worth knowing:** `npm test` runs the backend in-process against the test DB — it never
rebuilds the `backend` container. Passing tests do not mean the Docker backend is current.
After backend changes, run `docker compose up --build -d backend` before manually verifying
through the compose stack (curl, preview tools, or the frontend dev server proxying to :3000/
:8080), or a stale container will silently serve old routes.

## Iron rules
- The backend validates EVERYTHING (enums, references, cross-team epic rule) — spec §6.
- Referenced deletes (team with tickets/epics, epic with tickets) → HTTP 409. Spec §9.
- Timestamps: server-set, UTC, ISO-8601. Comments never touch ticket modified_at.
- Never commit .env or any credential. Never add seed data to the default startup path.
- Emails: trim + lowercase before storing; unique. Team names: unique case-insensitively.
- After finishing a task: run tests, update docs/PLAN.md checkbox, then commit.