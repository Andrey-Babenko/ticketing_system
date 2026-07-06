# Ticketing System — 48h Hackathon

## Source of truth
- Requirements: docs/spec.md (cite section numbers when justifying decisions)
- Task list: docs/PLAN.md — check off tasks as they complete; never silently reorder
- API contract: docs/openapi.yaml — both frontends conform to it; change it deliberately
- Onboarding + manual test steps: README.md

## Stack
React+Vite SPA (frontend/), Express+Prisma+Zod API (backend/), PostgreSQL,
cookie sessions, Argon2id, nodemailer→Mailpit. Angular twin in frontend-angular/ (stretch).
Prisma is pinned to v6 (v7 is a breaking rearchitecture — install with `@6`).

## Services & ports
frontend nginx 8080 (serves SPA, proxies /api → backend:3000), backend 3000,
postgres 5432 (app/app/ticketing), mailpit 8025 UI + 1025 SMTP, angular stub 8081 (profile "angular").

## Commands
- Full stack:      docker compose up --build          (open http://localhost:8080)
- Health check:    curl localhost:8080/api/health     (→ {"status":"ok"})
- Backend dev:     cd backend && npm run dev           (needs db+mailpit: docker compose up -d db mailpit)
- Backend tests:   cd backend && npm test
- E2E:             npx playwright test
- New migration:   cd backend && npx prisma migrate dev --name <name>

## Iron rules
- The backend validates EVERYTHING (enums, references, cross-team epic rule) — spec §6.
- Referenced deletes (team with tickets/epics, epic with tickets) → HTTP 409. Spec §9.
- Timestamps: server-set, UTC, ISO-8601. Comments never touch ticket modified_at.
- Never commit .env or any credential. Never add seed data to the default startup path.
- Emails: trim + lowercase before storing; unique. Team names: unique case-insensitively.
- After finishing a task: run tests, update docs/PLAN.md checkbox, then commit.