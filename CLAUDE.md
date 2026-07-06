# Ticketing System — 48h Hackathon

## Source of truth
- Requirements: docs/spec.md (cite section numbers when justifying decisions)
- Task list: docs/PLAN.md — check off tasks as they complete; never silently reorder
- API contract: docs/openapi.yaml — both frontends conform to it; change it deliberately

## Stack
React+Vite SPA (frontend/), Express+Prisma+Zod API (backend/), PostgreSQL,
cookie sessions, Argon2id, nodemailer→Mailpit. Angular twin in frontend-angular/ (stretch).

## Commands
- Full stack:      docker compose up --build
- Backend dev:     cd backend && npm run dev        (needs db+mailpit: docker compose up db mailpit)
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