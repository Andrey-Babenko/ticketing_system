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

## ADR-8: Postgres-backed cookie sessions, hand-rolled on Prisma

- **Status:** accepted · 2026-07-06
- **Context:** §9 allows cookie sessions or bearer tokens. ADR-1 gives a single origin
  (JWT's cross-origin advantage is moot); ADR-3 requires sessions that can be refused and
  revoked; §11 wants sessions to survive a backend restart; the stretch Angular twin should
  not need its own token plumbing.
- **Decision:** Opaque session id (32-byte crypto-random base64url) in an HttpOnly,
  SameSite=Lax cookie, backed by a `Session` model in the Prisma schema (`id`, `userId`,
  `expiresAt`, `createdAt`). Hand-rolled middleware (~40 lines): lookup → `req.user`;
  rolling 7-day expiry extended at most once per day; logout deletes the row and clears
  the cookie; expired rows are deleted lazily on lookup. No `express-session`/
  `connect-pg-simple` — their table lives outside Prisma migrations, breaking §9's
  single automated migration pipeline. JWT (stateless cookie or bearer) rejected: logout
  would not truly revoke, and bearer tokens push storage/interceptor code into both
  frontends for nothing.
- **Consequences:** Real server-side logout; sessions survive restarts via the DB we
  already run; zero auth code in either frontend beyond redirect-on-401; one DB read per
  authenticated request (irrelevant at this scale).

## ADR-9: Verification token lives in columns on User

- **Status:** accepted · 2026-07-06
- **Context:** §3 fixes 24h expiry, single-use, and reissue-invalidates-older. ADR-6 fixed
  the resend UX. Remaining choice: dedicated token table vs columns on the user row.
- **Decision:** `verificationToken` (unique, 32-byte crypto-random, stored raw),
  `verificationTokenExpiresAt`, and `emailVerifiedAt` on `User`. Reissue overwrites the
  columns, so at most one live token exists **by construction**. Verify endpoint resolves:
  token not found → `invalid_or_expired`; found + already verified → `already_verified`
  (success-flavored, so double-clicked links and React StrictMode double-fires are
  harmless); found + expired → `expired` (screen offers the ADR-6 email-input resend);
  found + valid → set `emailVerifiedAt`, keep the token. Single-use holds because re-use
  is a no-op. Tokens are not hashed at rest: they only flip a verification flag and grant
  no login.
- **Consequences:** All three §3 invariants enforced structurally rather than by code; no
  token table, no cleanup job, no used/invalidated flag logic. A token-history audit trail
  is forfeited — and explicitly out of scope (§12).

## ADR-10: Board drag-and-drop is optimistic with snapshot revert

- **Status:** accepted · 2026-07-06
- **Context:** §6 requires immediate persistence; §8 requires that a failed drag returns
  the card and shows an error; §13 requires the board to match post-refresh server truth;
  ADR-5 makes the drag a `PATCH {state}`.
- **Decision:** On drop: snapshot board state, render the card immediately at the **top**
  of the destination column (a successful PATCH bumps `modified_at`, so top-of-column is
  exactly what a refresh would show), fire the PATCH. On 200: reconcile with the returned
  ticket. On failure: restore the snapshot (card animates back) + toast. On 404
  specifically: toast + refetch the team's tickets instead of reverting (never resurrect a
  deleted card). A card with an in-flight PATCH is not draggable; the rest of the board
  stays live. Same-column drops are pure no-ops (no API call, no `modified_at` change).
  Library: dnd-kit (pointer-events based — native HTML5 DnD is unreliable in Firefox).
- **Consequences:** Drags feel instant; failure behavior is exactly §8's wording; the
  optimistic position can never disagree with post-refresh truth. One Playwright test with
  an intercepted 500 covers the §8 revert path end-to-end.
