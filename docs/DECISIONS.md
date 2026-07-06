# Architecture Decision Records

Short ADR-style log of decisions that are not (or not unambiguously) prescribed by
[spec.md](spec.md). Cite the ADR number in commits/PRs when a change touches one.
Superseding a decision = new ADR + status update here, not silent editing.

---

## ADR-1: Single browser origin via nginx reverse proxy

- **Status:** accepted · 2026-07-06
- **Context:** SPA and API run as separate containers (spec §2). Two origins would require
  CORS with credentialed cookies and SameSite tuning.
- **Decision:** The `frontend` container's nginx serves the built SPA and proxies `/api/*`
  to `backend:3000`. One origin: `http://localhost:8080`. Ports: frontend 8080, backend 3000,
  Postgres 5432, Mailpit 8025 (UI) / 1025 (SMTP), Angular stub 8081 (profile `angular`).
  The Vite dev server (5173) mirrors the same `/api` proxy for development.
- **Consequences:** No CORS or cookie-domain configuration anywhere. Cookie sessions work
  with plain `SameSite=Lax`. All API paths are `/api/...` in every environment.

## ADR-2: Prisma pinned to major version 6

- **Status:** accepted · 2026-07-06
- **Context:** Prisma 7 (current on npm) is a breaking rearchitecture: no `url` in
  `schema.prisma`, mandatory `prisma.config.ts`, driver adapters, changed client imports.
- **Decision:** Pin `prisma` and `@prisma/client` to `@6`. Classic `prisma-client-js`
  generator, `env("DATABASE_URL")` in the schema, standard `migrate dev`/`migrate deploy`.
- **Consequences:** Matches CLAUDE.md's documented workflow. Install Prisma packages with
  `@6`; treat any v7 upgrade as a deliberate migration, never a routine bump.

## ADR-3: Unverified login is refused — 403, no session

- **Status:** accepted · 2026-07-06
- **Context:** Spec §3 says an unverified account "cannot use the main application" but not
  what login itself does. Wireframe 2 shows a resend prompt on the login screen.
- **Decision:** Correct credentials on an unverified account → HTTP 403 with machine-readable
  code `EMAIL_NOT_VERIFIED`, and **no session is created**. Wrong credentials stay a generic
  401. The login screen shows the "Account not verified? Resend email" prompt only on
  receiving that 403 code.
- **Consequences:** No verified-flag gating inside business screens/endpoints — the session
  itself proves verification. QA scripts get a distinct, testable status code.

## ADR-4: Auto-increment integer IDs for all entities

- **Status:** accepted · 2026-07-06
- **Context:** Spec §9 allows UUIDs or database-generated numeric IDs. The ticket detail
  header displays an ID; URLs contain IDs.
- **Decision:** `Int @id @default(autoincrement())` for users, teams, epics, tickets,
  comments. Tickets display as `#42`; routes like `/tickets/42`.
- **Consequences:** Readable IDs in UI, URLs, and logs. ID enumeration is harmless because
  every verified user may access everything (§4). Locked in from the first migration.

## ADR-5: Ticket updates via a single partial PATCH

- **Status:** accepted · 2026-07-06
- **Context:** Board drags must persist immediately (§6); the edit form saves many fields;
  the backend must reject a ticket whose epic belongs to a different team (§6). Last write
  wins (§9).
- **Decision:** One `PATCH /api/tickets/:id` accepting any subset of editable fields.
  A drag sends `{"state": "..."}` only. The server validates the **merged** result
  (incoming ∪ stored): a team change whose merged epic mismatches → HTTP 400.
- **Consequences:** Smallest blast radius under last-write-wins; one endpoint for both
  frontends and for docs/openapi.yaml. No dedicated state-transition endpoint.

## ADR-6: Expired-token resend uses an email input, not token lookup

- **Status:** accepted · 2026-07-06
- **Context:** §3 requires resend from the verification-result screen; wireframe 2's expired
  variant shows error + resend. The token at hand is expired or possibly garbage.
- **Decision:** The expired/invalid variant renders a small email field + Resend button —
  the same component the login screen uses. One public endpoint,
  `POST /api/auth/resend-verification` with `{email}`, returns a generic 200 regardless of
  account state. Dead tokens are never used to resolve accounts.
- **Consequences:** No expired-token retention/lookup logic; unknown tokens get the same
  working UI. Issuing a new token still invalidates earlier unused ones (§3).

## ADR-7: Board filtering and search are client-side

- **Status:** accepted · 2026-07-06
- **Context:** §8 allows client- or server-side filtering; the usability bar is 100 tickets
  on one board.
- **Decision:** `GET /api/tickets?teamId=X` returns all of the team's tickets; type/epic
  filters and case-insensitive title substring search run in memory in the SPA (AND logic).
  Column and total counts reflect the filtered, visible set.
- **Consequences:** Instant filter UX, a minimal list-endpoint contract in openapi.yaml,
  trivial re-implementation in the stretch Angular twin. Revisit only if boards far exceed
  the 100-ticket bar (virtualization is already the sanctioned stretch, §14).
