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

## ADR-11: @dnd-kit without the sortable preset

- **Status:** accepted · 2026-07-06
- **Context:** The board is not a sortable list: a drop changes only column membership
  (state), and in-column order is computed (`modified_at` desc, ADR-10). @hello-pangea/dnd
  is built around index-based reordering — its drop animation settles the card at the drop
  index, which our re-sort immediately contradicts (the double-jump rejected in ADR-10).
- **Decision:** @dnd-kit with plain `useDraggable` (cards) / `useDroppable` (columns) and
  `DragOverlay` — no sortable preset. The drop event is "card X onto column Y", which is
  the PATCH payload. The real card never leaves its sorted position during a drag, so a
  failed PATCH means the overlay disappears and nothing moved.
- **Consequences:** Rollback needs no positional bookkeeping; pointer-event sensors work in
  Firefox/Edge (§11). We own sensor/collision/overlay wiring (~60 lines) and a11y
  affordances ourselves.

## ADR-12: Case-insensitive uniqueness — normalize emails, functional index for team names

- **Status:** accepted · 2026-07-06
- **Context:** §3 (emails) and §4 (team names) require case-insensitive uniqueness. Emails
  never need original casing (CLAUDE.md mandates trim+lowercase); team names must display
  as typed. Prisma's schema cannot express `lower()` indexes.
- **Decision:** Emails: trim + lowercase in the Zod layer on every email input (sign-up,
  login, resend), plain `@unique` as the DB backstop. Team names: a hand-added line in a
  migration — `CREATE UNIQUE INDEX team_name_ci ON "Team" (lower(name));` — noted in a
  schema.prisma comment since Prisma can't render it. The API additionally pre-checks
  (excluding self on rename) to return a friendly 409; the index is the race-safe backstop,
  its violation mapped to the same 409. Rejected: shadow `nameLower` column (invariant
  enforced by code in two forgettable places), `citext` (widens case-insensitivity to every
  comparison and adds an extension for the same outcome).
- **Consequences:** Both rules enforced structurally at the database; display casing
  preserved for teams; one raw-SQL line living only in migration history.

## ADR-13: Migrations on container start — healthcheck plus bounded retry

- **Status:** accepted · 2026-07-06
- **Context:** §9/§13 require schema creation to be automated inside `docker compose up
  --build`. `depends_on: service_healthy` only orders first boot; it does not protect
  `docker compose restart backend`, slow-laptop initdb windows, or crash-restarts.
- **Decision:** Keep the `pg_isready` healthcheck + `service_healthy` dependency, AND run
  `npx prisma migrate deploy` in the backend entrypoint behind a bounded retry
  (30 attempts × 2s), starting the server only after success and exiting non-zero if
  exhausted. Never `migrate dev` in a container (interactive; can reset data — a §9
  catastrophe). The backend image keeps dev dependencies so the `prisma` CLI is present.
- **Consequences:** Every startup path self-heals; migration failure is a loud container
  exit rather than a half-up API. Prisma's advisory lock makes overlapping deploys safe.

## ADR-14: Board data layer is TanStack Query v5

- **Status:** accepted · 2026-07-06
- **Context:** ADR-10 requires snapshot/rollback optimistic updates; §11 requires
  loading/empty/error states; team switching must not race (a stale response overwriting
  the newly selected team's board). Plain React state would hand-build caching, abort
  plumbing, and rollback bookkeeping.
- **Decision:** TanStack Query v5, used minimally: queries keyed by team
  (`['tickets', teamId]`, likewise teams/epics), mutations using the documented
  `onMutate` (snapshot + optimistic write) / `onError` (restore) / `onSettled` (invalidate)
  recipe for drags; the ADR-10 404 case is one `invalidateQueries` call.
- **Consequences:** Per-team caching and race safety for free; ADR-10 maps to the library's
  canonical pattern instead of a hand-rolled variant. One well-known dependency; the
  stretch Angular twin uses its own idioms regardless.

## ADR-15: Comment edit/delete semantics (S8.1, §14)

- **Status:** accepted · 2026-07-08
- **Context:** §14 lists "Edit or delete own comments" as an optional stretch feature
  with no further semantics; §7 fixes only the mandatory-scope behavior (immutable,
  never touches ticket `modifiedAt`). Every choice below needed a decision.
- **Decision:**
  - Ship both edit and delete, not just one.
  - Track edits with a nullable `Comment.editedAt`, server-set on every successful edit;
    the UI shows a "(edited)" marker. List order stays `createdAt` asc — edits don't
    reorder the thread.
  - Delete is a hard delete (no soft-delete placeholder) — §12 rules out audit history,
    and no requirement depends on a deleted comment's trace surviving.
  - A non-author edit/delete attempt is **403 FORBIDDEN**, not 404: comments carry no
    privacy in this app (§12, no private teams — every user already sees every comment
    and its author), so there is nothing to hide by pretending the resource is absent.
  - Routes are nested under the existing mount:
    `PATCH`/`DELETE /api/tickets/:id/comments/:commentId`, reusing `requireTicketId` so
    a `commentId` that belongs to a different ticket is a clean 404.
  - Same body-non-empty validation as create (`commentCreateSchema` rule reused).
- **Consequences:** One migration (`editedAt` column); `docs/openapi.yaml` gains the two
  operations, a `FORBIDDEN` error code, and a nullable `editedAt` on `Comment`. Ownership
  is enforced server-side (`authorId === req.user.id`); the UI's own-comment button
  gating (`useMe()`) is a convenience, not the security boundary.

## ADR-16: Virtualized board columns via @tanstack/react-virtual (S8.3, §8/§14)

- **Status:** accepted · 2026-07-08
- **Context:** §14 lists "virtualized rendering for large boards" as a stretch; ADR-7
  already anticipated it ("virtualization is already the sanctioned stretch"). §8's
  mandatory bar is 100 tickets; this stretch targets 1,000/team, smooth. Cards are
  variable-height (wrapping title, optional epic line) and each of the 5 columns is an
  independent list — ruling out fixed-row-size virtualizers.
- **Decision:**
  - `@tanstack/react-virtual`'s `useVirtualizer`, one instance per `Column`, with
    `measureElement` for dynamic row heights — same TanStack family as the query layer
    (ADR-14 precedent: minimal, canonical usage of a well-known dependency).
  - Always virtualize (no small-board/large-board code fork) — one path, exercised by
    every existing E2E test for free.
  - Each column becomes its own scroll container (Trello-style independent scroll),
    which requires the board to become viewport-height instead of the whole page
    growing/scrolling: `#root` moved from `min-height:100svh` to a fixed
    `height:100svh; overflow:hidden`, and `Layout`'s `<main>` became the scroll
    container for every non-board page (`overflow-y-auto`) so their behavior is
    unchanged.
  - `data-testid="column-<state>"` keeps its original meaning (the whole column shell,
    still the sole `useDroppable` region — drag/drop hit-testing is unaffected). A new
    `data-testid="column-scroll-<state>"` identifies the actual scrollable element,
    for tests that need to scroll it.
  - 10,000/team was considered and rejected: at that scale ADR-7's fetch-everything
    list endpoint and client-side filtering become the real bottleneck, which would
    drag pagination/server-side filtering into a rendering-only task.
- **Consequences:** DOM node count per column stays bounded (~15-25 rows) regardless of
  ticket count; `e2e/virtualization.spec.ts` covers the 300-ticket case (bounded DOM,
  scroll reveals off-screen cards, filtering reflects the full set, drag works on a
  rendered card); the 1,000-ticket bar is a documented manual check (README) since
  seeding it in every CI run isn't worth the suite-time. `TicketCard` visuals and
  `boardFilters.ts` are untouched — this is a render-layer change only.

## ADR-17: Password reset — 1h hashed tokens, full session revocation (S8.4, §14)

- **Status:** accepted · 2026-07-08
- **Context:** §14 lists "password reset flow" as a stretch with no semantics. The
  obvious template is ADR-9's verification-token design, but a reset token is
  materially different: it grants direct account takeover, where a verification
  token "only flips a verification flag and grants no login." Every place ADR-9's
  rationale relied on that low privilege needed its own decision here.
- **Decision:**
  - **1-hour TTL**, not 24h — a reset link is normally used minutes after being
    requested, unlike a verification link that might sit in an inbox for a day;
    shorter TTL shrinks the takeover window if a relay or inbox is compromised.
  - **Hash at rest**: `User.resetTokenHash = sha256(token)` (new column), never the
    raw value — a leaked DB read (backup, snapshot) then can't be replayed into a
    takeover. Plain SHA-256, not Argon2: the token is already 32 random bytes, so
    there's nothing to slow a brute-force of. This is a deliberate reversal of
    ADR-9's raw storage, which was correct for the lower-stakes verification token
    and is not correct here.
  - **Successful reset revokes ALL of the account's sessions**
    (`session.deleteMany({where:{userId}})`) — the person resetting a password is
    usually worried the old one leaked, so an attacker's live session must not
    survive. Exactly the revocation ADR-8 chose DB-backed sessions to get.
  - **Unverified accounts get no reset mail** (identical generic 200 regardless) —
    keeps the two email-token flows fully orthogonal: an unverified user's path
    stays resend-verification → verify (ADR-3's login-screen prompt), never crossing
    into reset-token state.
  - Endpoints: `POST /auth/request-password-reset {email}` (mirrors
    resend-verification's anti-enumeration 200) and `POST /auth/reset-password
    {token, password}` (mirrors verify's lookup/expiry resolution order); both public.
    No auto-login after reset (mirrors §3's no-auto-login-after-verify).
- **Consequences:** One migration (`resetTokenHash`, `resetTokenExpiresAt`);
  `docs/openapi.yaml` gains both operations. `e2e/password-reset.spec.ts` covers the
  full mail round-trip (request → Mailpit → reset → old password dead, new one
  works); session revocation is covered by a supertest case and a manual check
  (second live session dies immediately after reset).

## ADR-19: SMTP secrets are env vars injected at deploy time (S8.5, §14)

- **Status:** accepted · 2026-07-08
- **Context:** §3 requires the verification/reset mail path to support a real relay
  (`relay1.dataart.com`), and §11 forbids exposing SMTP secrets in source control.
  `mailer.ts` already reads `SMTP_HOST/PORT/SECURE/USER/PASS/FROM` from
  `process.env` (ADR context predates this ADR), but `docker-compose.yml` pinned
  `SMTP_HOST`/`SMTP_PORT` to the Mailpit literals, so there was no way to point the
  compose stack at relay1 without hand-editing the file — and no recorded decision
  on where the credentials themselves should live.
- **Decision:** SMTP secrets are ordinary environment variables injected at deploy
  time, not files or committed config:
  - **Local / manual prod-style run:** an uncommitted `.env.relay1` (see
    `.env.relay1.example` for the shape), fed to compose with
    `docker compose --env-file .env.relay1 up`. `.env*` is already gitignored
    except `.env.example`.
  - **Real production:** the orchestrator's own secret store (k8s Secret / ECS
    Secrets Manager / Vault) injects the identical `SMTP_*` variables — same
    contract, zero code change.
  - `docker-compose.yml`'s `SMTP_HOST`/`SMTP_PORT` are now `${VAR:-default}`
    (previously pinned to the Mailpit literals), matching the pattern already used
    for `SMTP_USER/PASS/SECURE/FROM`; the Mailpit default is unchanged.
  - **Rejected/deferred:** Docker Compose `secrets:` (files under `/run/secrets/`)
    is more secure at rest but needs a `SMTP_PASS_FILE` read path in `mailer.ts` —
    real app-code work, deferred until env-var injection is outgrown. Committed
    encrypted secrets (SOPS/sealed-secrets) are over-scoped for a hackathon.
- **Consequences:** No application code changes. `.env.relay1.example` is
  committed as the documented template; a filled-in `.env.relay1` never is.
  Production deployment infrastructure itself (§14) remains out of scope — this
  ADR only fixes the config *path*, not a deployed relay.
- **Manual verification (2026-07-08):** signed up with a real address through the
  compose stack, `--env-file .env.relay1`. Findings, systematically isolated —
  reachability, then port/TLS, then auth, each confirmed independently:
  1. `relay1.dataart.com` gave 100% ICMP loss and TCP timeouts on both 587 and 465
     with no VPN active; account creation still succeeded (SMTP failure is
     non-fatal, per S1.1's "register default").
  2. With the DataArt VPN connected, ICMP and TCP both succeeded on **465**; port
     **587 still timed out** — the relay only accepts implicit TLS, not STARTTLS.
     `.env.relay1.example` corrected from the originally-assumed 587/`secure=false`
     to 465/`secure=true`.
  3. At 465 the TLS handshake and EHLO succeeded, then the relay replied
     `EAUTH: Missing credentials for "LOGIN"` — AUTH is mandatory, not optional as
     first assumed. Template comments corrected accordingly.
  End-to-end delivery (a received email) was not yet confirmed — blocked on
  obtaining real relay1 credentials, tracked as follow-up.

## ADR-18: Angular twin — generated client, signals, Material/CDK, shared E2E oracle

- **Status:** accepted · 2026-07-08
- **Context:** PLAN.md's S8.2 ("Angular twin consuming openapi.yaml") was promoted to
  its own Slice 9 — a whole second frontend is a different scale of work than the
  other §14 stretches, and by the time it's picked up the React app has grown three
  shipped stretch features (S8.1 comment edit/delete, S8.3 virtualization, S8.4
  password reset) beyond the mandatory §13 scope. Every structural choice below was
  a real decision, made in a brainstorming session before the Slice 9 subtasks were
  written.
- **Decision:**
  - **Full parity** with the React app — mandatory §13 scope plus all three shipped
    stretches, not just the DoD checklist. Chosen over mandatory-only or
    board-plus-auth-only: a twin that QA can't create data through, or that silently
    lags the app it's supposed to mirror, undersells the "twin" premise.
  - **Generated API client** from `docs/openapi.yaml` via **ng-openapi-gen** (a
    pure-Node Angular generator) rather than hand-written services or the Java-based
    `openapi-generator-cli`. This is what makes "consuming openapi.yaml" literally
    true instead of aspirational: contract drift breaks the twin's compile, giving
    CLAUDE.md's "change it deliberately" rule real teeth. No JVM in the Docker build.
  - **Signals + plain services**, no NgRx, no TanStack Angular adapter — ADR-14
    already anticipated "the stretch Angular twin uses its own idioms regardless."
    ADR-10's optimistic-move/targeted-revert board semantics are implemented on a
    plain tickets signal with a captured-previous-value restore on failure; the
    handful of cache behaviors TanStack gives React for free (per-team caching,
    request dedupe) are hand-rolled at this app's small scale.
  - **Board: CDK drag-drop + CDK virtual scroll, fixed-height cards.** `cdkDropList`
    connected columns with the drop INDEX ignored — the same move ADR-11 made for
    dnd-kit (drop means "card X onto column Y"; in-column order stays computed by
    `modifiedAt`, never a manual position). Cards are fixed-height and line-clamped
    so virtualization can use CDK's stable, first-party fixed-size strategy;
    variable-height virtualization only exists in `cdk-experimental`, rejected as
    unstable and poorly-documented in combination with drag-drop. Accepted trade:
    the twin's cards don't wrap descriptions exactly like React's.
  - **Angular Material** for styling, not a Tailwind port — the ecosystem-native
    look, chosen over pixel parity. The resulting visual divergence from React is
    accepted; what's NOT allowed to diverge is the semantic layer the E2E suite
    depends on — field labels, button/heading accessible names, dialog roles
    (`MatDialog` as `role="alertdialog"` for confirms), and the existing
    `data-testid` contract (`card-<id>`, `column-<state>`, `column-scroll-<state>`,
    `drag-overlay` on the `cdkDragPreview` template).
  - **Verification: the same Playwright suite, run as a second project** — add an
    `angular` project to `playwright.config.ts` with `baseURL http://localhost:8081`.
    The 4 existing specs (happy path, drag-failure, virtualization, password-reset)
    become the twin's acceptance oracle instead of a hand-written parallel spec.
    Selector friction while wiring this up IS a real UX divergence surfacing, to be
    fixed on the twin's markup, not papered over with forked specs.
- **Consequences:** One behavioral spec, two independently-built implementations —
  the strongest parity check available. `docs/PLAN.md`'s Slice 9 breaks the work into
  7 subtasks (scaffold/client/Docker → auth → teams/epics → tickets/comments →
  board+virtual-scroll → drag-drop → E2E-parity+docs), each proceeding through the
  normal TDD/verification cycle. Cost: this is the single largest slice in the
  project (~19h estimated) for a feature §14 lists as optional.
