# Ticketing System

A Kanban-style ticket tracker built as a three-tier single-page application for a 48h hackathon.
Registered users organize work tickets by team and move them through a fixed Kanban workflow.

**Mandatory scope:** authentication, teams, epics, tickets, comments, and a draggable Kanban board.
See [docs/spec.md](docs/spec.md) for the full requirements (§1–§15 are the source of truth).

## Architecture

Three logical tiers, each in its own container:

| Tier          | Tech                                      | Directory          |
| ------------- | ----------------------------------------- | ------------------ |
| Presentation  | React + Vite SPA (TypeScript)             | `frontend/`        |
| Application   | Express + Prisma + Zod API (TypeScript)   | `backend/`         |
| Persistence   | PostgreSQL                                | (db container)     |

Supporting services: **Mailpit** captures outgoing email in dev. An **Angular** twin
(`frontend-angular/`) is a stretch goal, currently a placeholder behind a compose profile.

In production compose, the `frontend` service is **nginx**: it serves the built SPA and
reverse-proxies `/api/*` to the backend, so the browser only ever talks to one origin.

## Ports

| Service            | URL / Port                | Notes                                  |
| ------------------ | ------------------------- | -------------------------------------- |
| Frontend (nginx)   | http://localhost:8080     | Serves SPA, proxies `/api` to backend  |
| Backend API        | http://localhost:3000     | Published for direct debugging         |
| PostgreSQL         | localhost:5432            | user `app` / pass `app` / db `ticketing` |
| Mailpit web UI     | http://localhost:8025     | View captured emails                   |
| Mailpit SMTP       | localhost:1025            | Backend sends mail here in dev         |
| Angular stub       | http://localhost:8081     | Only with `--profile angular`          |

## Quick start

From a clean checkout, the whole stack starts with a single command (spec §2) — no host-installed
Node, Postgres, or build tools required, only Docker:

```bash
docker compose up --build
```

Then open http://localhost:8080. No `.env` file is needed; the compose file has safe inline defaults.

## Prerequisites

- Docker + Docker Compose (that's it for the containerized path)
- Node.js 22 + npm — only if you want to run the backend on the host (see below)

## Commands

### Full stack (Docker)
```bash
docker compose up --build -d        # build + start everything in the background
docker compose ps                   # service status (db should be "healthy")
docker compose logs -f backend      # tail one service's logs
docker compose logs -f              # tail all services
docker compose down                 # stop & remove containers (keeps db volume)
docker compose down -v              # also wipe the db volume (fully clean slate)
```

### Development mode (hot reload)
The fast inner loop: run infrastructure in Docker, run the app(s) on the host with hot reload.
The Vite dev server proxies `/api` to the backend on `:3000` (see `frontend/vite.config.ts`), so
frontend code always calls `/api/...` — no environment-specific URLs, same as nginx in production.

```bash
# 1. Infrastructure (+ backend) in Docker
docker compose up -d db mailpit backend      # backend on :3000

# 2. Frontend with hot module reload on the host
cd frontend
npm install
npm run dev                                  # → http://localhost:5173 (instant HMR)
```

To hot-reload the **backend** too, run it on the host instead of in Docker:
```bash
docker compose up -d db mailpit              # infra only
cd backend
cp ../.env.example .env                       # DATABASE_URL → localhost:5432 (gitignored)
npm install
npm run dev                                  # tsx watch on :3000, restarts on save
```
Either way, open **http://localhost:5173** for the dev SPA. (Port 8080 is the production nginx
build from `docker compose up --build`, which does *not* hot-reload.)

### Prisma (database schema)
```bash
cd backend
npx prisma generate                 # regenerate the client after editing schema.prisma
npx prisma migrate dev --name <name> # create + apply a new migration (dev)
npx prisma studio                   # browse the DB in a GUI
```
> **Note:** Prisma is pinned to **v6**. v7 is a breaking rearchitecture (config file + driver
> adapters, no `url` in `schema.prisma`). Install Prisma packages with `@6`.

### Angular stub (stretch)
```bash
docker compose --profile angular up --build -d frontend-angular   # → http://localhost:8081
```

## Automated tests

```bash
# Backend unit/integration tests (real Postgres, not mocked) — needs db up
docker compose up -d db
cd backend && npm install && npm test

# Frontend unit tests (pure functions: board filters, optimistic drag update)
cd frontend && npm install && npm test

# End-to-end (Playwright) — drives the real UI against the compose stack on :8080,
# including fetching the verification email from Mailpit's REST API and a real
# drag-and-drop. Host Node is fine here (spec §2 governs app startup, not tooling).
docker compose up --build -d      # full stack must be up first
npm install                       # root package.json
npx playwright install chromium   # one-time browser download
npx playwright test
```

§11's "at least one backend business flow and one frontend or API flow" is covered by
`backend/test/auth.session.test.ts` (signup → verify → login → me → logout → 401) and
`e2e/happy.spec.ts` (the same flow driven through the real browser, plus teams, epics,
tickets, drag-and-drop, and comments).

## Manual testing / verification

Run from the repo root while the stack is up.

```bash
# 1. Services healthy
docker compose ps

# 2. Health endpoint (runs a real DB query before answering)
curl -i localhost:8080/api/health        # via nginx  → {"status":"ok"} HTTP 200
curl -i localhost:3000/api/health        # direct

# 3. Frontend + Mailpit
open http://localhost:8080               # React SPA
open http://localhost:8025               # Mailpit UI

# 4. Failure path — proves health actually depends on the DB
docker compose stop db
curl -i localhost:8080/api/health        # → {"status":"error"} HTTP 503
docker compose start db && sleep 3
curl -i localhost:8080/api/health        # → back to 200 (lazy reconnect)

# 5. Fresh DB has no application tables (spec §9)
docker compose exec db psql -U app -d ticketing -c '\dt'   # "Did not find any relations."
```

## Project layout

```
.
├── backend/            # Express + Prisma API (TypeScript, ESM)
│   ├── prisma/         # schema.prisma + migrations
│   ├── src/            # routes/, middleware/, lib/, app.ts, index.ts
│   ├── test/           # vitest — real Postgres, no mocks
│   └── Dockerfile
├── frontend/           # Vite + React SPA (TypeScript)
│   ├── src/            # pages/, components/, api/, lib/
│   ├── nginx.conf      # SPA fallback + /api proxy
│   └── Dockerfile      # multi-stage: node build → nginx
├── frontend-angular/   # Angular twin — placeholder stub (stretch)
├── e2e/                # Playwright — drives the compose stack on :8080
├── docs/
│   ├── spec.md         # requirements (source of truth)
│   ├── PLAN.md         # task list, checked off per slice
│   ├── DECISIONS.md    # ADRs for anything spec.md leaves open
│   ├── ARCHITECTURE.md # topology/ports/env + auth flow diagram
│   ├── DATA_MODEL.md   # Prisma schema draft + integrity rules
│   └── openapi.yaml    # API contract both frontends conform to
├── docker-compose.yml
├── package.json         # root — Playwright only
└── .env.example
```

## Conventions

- The backend validates **everything** (enums, references, cross-team epic rule) — spec §6.
- Referenced deletes (team with tickets/epics, epic with tickets) → HTTP 409 — spec §9.
- Timestamps are server-set, UTC, ISO-8601. Comments never touch a ticket's `modified_at`.
- Emails are trimmed + lowercased before storing and are unique. Team names are unique case-insensitively.
- **Never commit `.env` or any credential. Never add seed data to the default startup path.**
