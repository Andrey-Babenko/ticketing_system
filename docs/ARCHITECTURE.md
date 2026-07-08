# Architecture

Three-tier SPA per spec §2, decided in [DECISIONS.md](DECISIONS.md) (ADR numbers cited).

## Tiers & containers

| Tier | Container | Image / build | Host port | Role |
|---|---|---|---|---|
| Presentation | `frontend` | multi-stage: node build → nginx:alpine | **8080** | Serves built React SPA; proxies `/api/*` → `backend:3000` (ADR-1) |
| Presentation (stretch) | `frontend-angular` | multi-stage: node build → nginx:alpine (profile `angular`) | 8081 | Angular 20 twin, full parity (ADR-18); generated client from [openapi.yaml](openapi.yaml) via ng-openapi-gen |
| Application | `backend` | node:22-slim, Express + Prisma 6 (ADR-2) | 3000 | HTTP API under `/api`; runs `migrate deploy` on boot behind bounded retry (ADR-13) |
| Persistence | `db` | postgres:16-alpine | 5432 | All application data; named volume `db_data`; `pg_isready` healthcheck gates backend start |
| Mail (dev) | `mailpit` | axllent/mailpit | 8025 UI / 1025 SMTP | Captures verification emails; QA reads them at http://localhost:8025 |

`docker compose up --build` from a clean checkout starts everything (spec §2); the `angular`
profile is opt-in. Postgres data survives `down`/`up` via the named volume (§11); only
`down -v` wipes it.

## Same-origin topology (ADR-1)

The browser only ever talks to **one origin**. In production compose that's nginx on :8080,
which serves static SPA assets (with `try_files … /index.html` history-fallback so deep-route
refreshes work) and reverse-proxies `/api/*` to the backend, prefix preserved. In development,
the Vite dev server on :5173 mirrors the same `/api` proxy. Result: zero CORS configuration,
no credentialed-fetch flags, and the session cookie (ADR-8) works with plain
`HttpOnly; SameSite=Lax`. The Angular twin gets the same guarantee by sitting behind the same
proxy pattern.

## Environment variables

Compose runs with **zero `.env`** — every variable has an inline `${VAR:-default}` dev-only
default (ADR-13 context; spec §13 "no committed secret" = no *real* credential, dev defaults
are fine). [.env.example](../.env.example) documents host-dev values.

| Variable | Default (compose) | Used by | Purpose |
|---|---|---|---|
| `DATABASE_URL` | `postgresql://app:app@db:5432/ticketing` | backend | Prisma connection |
| `PORT` | `3000` | backend | API listen port |
| `SMTP_HOST` / `SMTP_PORT` | `mailpit` / `1025` | backend | nodemailer target; point at `relay1.dataart.com:587` + auth vars to satisfy §3 |
| `SMTP_USER` / `SMTP_PASS` / `SMTP_SECURE` | empty / empty / `false` | backend | Optional AUTH + TLS for real relays; never committed |
| `SMTP_FROM` | `noreply@ticketing.local` | backend | From header |
| `APP_BASE_URL` | `http://localhost:8080` | backend | Absolute base for verification links in email (ADR-9) |
| `POSTGRES_USER/PASSWORD/DB` | `app`/`app`/`ticketing` | db | Container init |

No session-signing secret exists: session ids are opaque random strings looked up in the DB
(ADR-8), so there is nothing to sign.

## Signup → verification → login flow

```mermaid
sequenceDiagram
    autonumber
    participant B as Browser (SPA)
    participant N as nginx :8080
    participant A as API (Express) :3000
    participant P as Postgres
    participant M as Mailpit (SMTP)

    Note over B,M: Sign-up
    B->>N: POST /api/auth/signup {email, password}
    N->>A: proxy /api/auth/signup
    A->>A: trim+lowercase email (ADR-12), Argon2id hash (§3)
    A->>P: INSERT User (unverified) + verificationToken, expires now+24h (ADR-9)
    A->>M: SMTP: mail with APP_BASE_URL/verify?token=…
    A-->>B: 201 — SPA shows "check your email"

    Note over B,M: Verification (user clicks link in Mailpit UI)
    B->>N: GET /verify?token=… (SPA route)
    N-->>B: index.html (history fallback)
    B->>N: POST /api/auth/verify {token}
    N->>A: proxy
    A->>P: lookup by token → set emailVerifiedAt (single-use by construction)
    A-->>B: 200 {status: verified} — "Continue to login" (no auto-login, §3)

    Note over B,M: Login
    B->>N: POST /api/auth/login {email, password}
    N->>A: proxy
    A->>P: verify Argon2id; emailVerifiedAt present? (else 403 EMAIL_NOT_VERIFIED, ADR-3)
    A->>P: INSERT Session (opaque id, expires +7d rolling) (ADR-8)
    A-->>B: 200 + Set-Cookie sid (HttpOnly, SameSite=Lax)
    B->>N: GET /api/teams … (cookie attached automatically)
    N->>A: proxy
    A->>P: session lookup → req.user
    A-->>B: 200
```

## Application-tier structure (backend)

`src/middleware/` (auth session lookup with public-route allowlist §3, Zod validation,
error envelope `{error:{code,message,field?}}`), `src/routes/` (auth, teams, epics, tickets,
comments — one file per resource), `src/lib/` (prisma client, mailer, token generation).
Full endpoint contract: [openapi.yaml](openapi.yaml). Data model: [DATA_MODEL.md](DATA_MODEL.md).
