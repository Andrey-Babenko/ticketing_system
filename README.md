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

Supporting services: **Mailpit** captures outgoing email in dev. An **Angular 20** twin
(`frontend-angular/`, behind the `angular` compose profile) is a full-parity second
frontend (stretch, ADR-18) consuming `docs/openapi.yaml` via a generated client
(ng-openapi-gen) — same backend, same Playwright suite as its acceptance oracle.

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
| Angular twin       | http://localhost:8081     | Only with `--profile angular`          |

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

### Angular twin (stretch, ADR-18)
```bash
docker compose --profile angular up --build -d frontend-angular   # → http://localhost:8081
```

The twin consumes `docs/openapi.yaml` through a **generated** client (not hand-written
services) — that's what makes "consuming openapi.yaml" literally true instead of
aspirational. Regenerate it after any contract change:
```bash
cd frontend-angular
npm install
npm run generate:api          # ng-openapi-gen → src/app/api/ (committed, diff it before committing)
npm test                      # Vitest — pure functions (board filters, optimistic drag update)
npm start                     # → http://localhost:4200, proxies /api to a host backend on :3000
```

### Sending real email (relay1, ADR-19)

By default the compose stack sends verification/reset mail to **Mailpit** — nothing to
configure. To send through a real relay (`relay1.dataart.com`, spec §3) instead:

```bash
cp .env.relay1.example .env.relay1   # then fill in SMTP_USER/PASS — relay1 requires AUTH
docker compose --env-file .env.relay1 up --build
```

`--env-file` only changes which file Compose uses to fill in `${VAR}` placeholders in
`docker-compose.yml` — it does not inject anything by itself, and a real shell env var
(e.g. `export SMTP_HOST=...`) takes priority over the file. Never commit `.env.relay1` —
it's already covered by `.gitignore`'s `.env.*` rule.

> **Confirmed by manual testing (2026-07-08):** `relay1.dataart.com` is only reachable
> from the **DataArt VPN** (100% packet loss without it); it accepts **port 465
> (implicit TLS)**, not 587/STARTTLS, which times out even over VPN; and it **requires
> AUTH LOGIN** — `SMTP_USER`/`SMTP_PASS` are not optional for this relay.

## Automated tests

```bash
# Backend unit/integration tests (real Postgres, not mocked) — needs db up
docker compose up -d db
cd backend && npm install && npm test

# Frontend unit tests (pure functions: board filters, optimistic drag update)
cd frontend && npm install && npm test

# End-to-end (Playwright) — drives the real UI against the compose stack, including
# fetching the verification email from Mailpit's REST API and a real drag-and-drop.
# Host Node is fine here (spec §2 governs app startup, not tooling).
docker compose up --build -d                        # React frontend + backend
docker compose --profile angular up --build -d      # + Angular twin (ADR-18)
npm install                                         # root package.json
npx playwright install chromium                     # one-time browser download
npx playwright test
# Or scope to one frontend: npm run test:e2e:react / npm run test:e2e:angular
```

The same 4 specs run as **two Playwright projects** — `chromium` against the React app
on :8080, `angular` against the twin on :8081 — for 8 spec-runs total. Both compose
profiles must be up; global setup pings all three origins (app, twin, Mailpit) up front
and fails fast with the exact command to run if one isn't reachable. Run just one side
while iterating with `npm run test:e2e:react` / `npm run test:e2e:angular` (or the
underlying `--project=chromium` / `--project=angular` flag directly).

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

### Comment edit/delete (S8.1, §14 stretch)

Sign in as two different users and open the same ticket (comments have no access
control beyond authorship — §12, no private teams):

1. As user A, post a comment. Edit/Delete buttons appear only on your own comment.
2. As user B, open the same ticket. User A's comment shows no Edit/Delete buttons.
3. Edit your own comment → body updates, a "(edited)" marker appears, the ticket's
   Modified stamp is unchanged (§7).
4. Delete your own comment → it disappears from the list; Modified stamp still unchanged.
5. `curl -X PATCH localhost:8080/api/tickets/<id>/comments/<commentId>` as a non-author
   (with that user's session cookie) → `403 FORBIDDEN`.

### Large-board smoothness at 1,000 tickets (S8.3, §8/§14 stretch, ADR-16)

The 300-ticket bar is covered by `e2e/virtualization.spec.ts` (bounded DOM, scrolled
content, filtering, drag). The 1,000-ticket smoothness bar is checked manually — seed via
the API (curl or a short loop), since 1,000 UI-driven creates would be impractical:

```bash
# after signup/verify/login with a cookie jar (see auth endpoints above), then:
for i in $(seq 1 1000); do
  curl -s -o /dev/null -b cookies.txt -X POST localhost:8080/api/tickets \
    -H "Content-Type: application/json" \
    -d "{\"teamId\":<id>,\"type\":\"bug\",\"state\":\"new\",\"title\":\"Perf $i\",\"body\":\"b\"}"
done
```

Open the board for that team and confirm: scrolling each column is smooth (DOM stays
bounded — inspect with devtools, only a couple dozen `[data-testid^="card-"]` nodes exist
per column regardless of its total count), column/filter counts reflect the full set, and
drag-and-drop still works for any rendered card.

**Zsh footgun hit while seeding this manually:** zsh arrays are 1-indexed by default —
`${STATES[$((RANDOM % 5))]}` silently drops the last element and returns empty (→ 400) for
index 0. Use `${STATES[$(( (RANDOM % 5) + 1 ))]}` in zsh, or `bash -c '...'`.

### Password reset (S8.4, §14 stretch, ADR-17)

Covered end-to-end by `e2e/password-reset.spec.ts`. One thing that test doesn't check —
session revocation — is worth a manual pass:

1. Log in as a verified user in one browser/session ("session A").
2. From the login screen, click "Forgot password?", submit that email, and confirm
   the "Check your email" copy.
3. Open Mailpit (`http://localhost:8025`), open the "Reset your password" mail, click
   the link — it lands on `/reset-password?token=…`.
4. Set a new password; you land on the "Continue to login" panel (no auto-login, same
   as verification).
5. Back in session A (still open in the other browser), reload any page — you're
   bounced to `/login`: the reset revoked **every** session on the account, not just
   the one that requested it.
6. Confirm the old password now gets `INVALID_CREDENTIALS` and the new one logs in.

`curl` shortcut for steps 1-6 without a browser (useful for scripting the session-
revocation check): sign up/verify/login for session A's cookie, then
`POST /api/auth/request-password-reset`, pull the token from Mailpit's API the same
way as the E2E helper, `POST /api/auth/reset-password`, then re-`GET /api/auth/me`
with session A's cookie → `401`.

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
├── frontend-angular/   # Angular 20 twin — full parity (stretch, ADR-18)
│   ├── src/app/        # pages/, components/, core/, lib/, api/ (generated, committed)
│   ├── nginx.conf      # SPA fallback + /api proxy (mirrors frontend/)
│   └── Dockerfile      # multi-stage: node build → nginx
├── e2e/                # Playwright — drives BOTH compose stacks (:8080 and :8081)
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
