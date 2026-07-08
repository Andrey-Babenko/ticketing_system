# Implementation Plan — Ticketing System (48h)

Task list of record (CLAUDE.md): check off tasks as they complete; **never silently reorder**.
Slices are vertical (API + UI + tests ship together) and ordered by the risk ranking from the
spec analysis: verification pipeline first, board/DnD second, everything else behind them.
Every task follows TDD: the listed tests are written **first** (superpowers:test-driven-development).

Conventions cited throughout: spec §sections, ADR-numbers from [DECISIONS.md](DECISIONS.md).
Contract of record for all endpoints: [openapi.yaml](openapi.yaml). Estimates assume solo + Claude.

**Budget: ~34h core + ~6h buffer/stretch of the 48h.**

---

## Slice 0 — Foundation (est. 4h)

- [x] **S0.1 Prisma schema + first migration** *(est. 1.5h)*
  - **Goal:** All seven models (User, Session, Team, Epic, Ticket, Comment + enums) migrated into Postgres; `lower(name)` unique index on Team added by hand (ADR-12).
  - **Acceptance:** `prisma migrate dev` produces a migration that applies cleanly to a fresh DB; fresh DB contains zero application rows (§9); enums exactly `bug|feature|fix`, `new|ready_for_implementation|in_progress|ready_for_acceptance|done` (§6); FK rules: Team→Ticket/Epic **Restrict**, Epic→Ticket **Restrict** (nullable), Ticket→Comment **Cascade**, User→Session **Cascade** (§4, §5, §6).
  - **Tests first:** schema assertion test — insert/violate each FK rule via Prisma client against the test DB; expect Restrict/Cascade behavior (this is the §9 referential-integrity backbone).
  - **Files:** `backend/prisma/schema.prisma`, `backend/prisma/migrations/*`, `backend/test/schema.test.ts`, `docs/DATA_MODEL.md` (kept in sync).
- [x] **S0.2 Migrate-on-boot + error envelope + validation middleware** *(est. 1.5h)*
  - **Goal:** ADR-13 entrypoint (bounded-retry `migrate deploy`); one error envelope `{error:{code,message,field?}}`; Zod request validation wrapper; 401 auth middleware skeleton with public-route allowlist (§3 exemptions).
  - **Acceptance:** `docker compose up --build` from clean checkout migrates then serves (§2, §13); unknown route → 404 envelope; invalid JSON → 400 envelope; `/api/health` still 200.
  - **Tests first:** supertest — envelope shape for 400/404; health returns ok.
  - **Files:** `backend/entrypoint.sh`, `backend/Dockerfile` (CMD), `backend/src/middleware/{errors,validate,auth}.ts`, `backend/src/lib/prisma.ts`, `backend/test/http.test.ts`.
- [x] **S0.3 Frontend shell** *(est. 1h)*
  - **Goal:** Router (routes: /login /signup /verify /board/:teamId? /teams /epics /tickets/:id /tickets/new), TanStack Query provider (ADR-14), API client honoring the envelope, layout with Board/Teams/Epics tabs + user menu placeholder, global 401→/login redirect.
  - **Acceptance:** All routes render placeholder screens; refresh on any deep route serves the SPA (nginx fallback, ADR-1); 401 from any query redirects to /login.
  - **Tests first:** none beyond a smoke render (E2E covers navigation later).
  - **Files:** `frontend/src/{main,App}.tsx`, `frontend/src/api/client.ts`, `frontend/src/routes.tsx`, `frontend/src/components/Layout.tsx`.

## Slice 1 — Auth & verification API (est. 6h) — **top risk, first**

- [x] **S1.1 Sign-up + verification email** *(est. 2h)*
  - **Goal:** `POST /api/auth/signup` — trim+lowercase email (ADR-12), Argon2id hash (§3), create unverified user + token columns (ADR-9), send mail via nodemailer→Mailpit with `${APP_BASE_URL}/verify?token=…` link (SMTP_* envs, relay1-capable §3).
  - **Acceptance:** §3: duplicate email → 409; password <8 → 400; mail visible in Mailpit UI; no plaintext password anywhere; SMTP failure still creates the account (register default).
  - **Tests first:** supertest — 201 happy path (token row populated, argon2 verifies); 409 duplicate incl. case/whitespace variants; 400 short password; mailer mocked + called with token link.
  - **Files:** `backend/src/routes/auth.ts`, `backend/src/lib/{mailer,tokens}.ts`, `backend/src/validation/auth.ts`, `backend/test/auth.signup.test.ts`.
- [x] **S1.2 Verify + resend** *(est. 2h)*
  - **Goal:** `POST /api/auth/verify` with the four outcomes of ADR-9 (verified / already_verified / expired / invalid_or_expired); `POST /api/auth/resend-verification` `{email}` → generic 200, reissue-overwrites (§3), only for existing-unverified.
  - **Acceptance:** §3: token single-use (second call → already_verified); 24h expiry honored; reissue invalidates the old link; resend from expired screen works with email only (ADR-6).
  - **Tests first:** supertest — all four verify outcomes; old token dead after resend; resend for verified/unknown email → same generic 200, no mail sent.
  - **Files:** `backend/src/routes/auth.ts`, `backend/test/auth.verify.test.ts`.
- [x] **S1.3 Login / logout / sessions** *(est. 2h)*
  - **Goal:** ADR-8 session table + middleware (rolling 7-day, lazy expiry cleanup); `POST /api/auth/login` — 401 bad credentials, **403 EMAIL_NOT_VERIFIED** unverified (ADR-3), 200 sets HttpOnly SameSite=Lax cookie; `POST /api/auth/logout` deletes row + clears cookie; `GET /api/auth/me`.
  - **Acceptance:** §3, §9: session id never in URLs; unverified never gets a session; logout truly revokes (subsequent request 401); protected endpoint without cookie → 401. **This is the §11 "backend business flow" test.**
  - **Tests first:** supertest with cookie jar — full flow signup→verify→login→me→logout→401; unverified login → 403 code; wrong password → 401.
  - **Files:** `backend/src/routes/auth.ts`, `backend/src/middleware/auth.ts`, `backend/test/auth.session.test.ts`.

## Slice 2 — Auth UI (est. 3.5h)

- [x] **S2.1 Sign-up + login screens** *(est. 2h)*
  - **Goal:** Wireframe-2 forms: signup (email, password, confirm-password client-side only, min-8 hint), login (+ resend prompt shown on 403 EMAIL_NOT_VERIFIED, ADR-3), post-signup "check your email" state.
  - **Acceptance:** §3, §10: field errors inline from envelope; verified login lands on /board; unverified shows resend which posts the typed email.
  - **Tests first:** (deferred to E2E in S7 — forms are thin over tested API).
  - **Files:** `frontend/src/pages/{Login,Signup}.tsx`, `frontend/src/api/auth.ts`.
- [x] **S2.2 Verification result screen + guards** *(est. 1.5h)*
  - **Goal:** /verify?token=… calls verify once (StrictMode-guarded, ADR-9), renders verified/already_verified → "Continue to login", expired/invalid → error + email input + resend (ADR-6); route guards: business routes require session, /login|/signup redirect away when authed.
  - **Acceptance:** §3, §10: all four variants reachable; expired resend issues fresh mail; no auto-login after verify.
  - **Files:** `frontend/src/pages/Verify.tsx`, `frontend/src/lib/authGuard.tsx`.

## Slice 3 — Teams (est. 3.5h)

- [x] **S3.1 Teams API** *(est. 2h)*
  - **Goal:** CRUD per openapi.yaml: list (name-asc + `_count` tickets/epics, wireframe 4), create/rename (trimmed, CI-unique excluding self → 409, ADR-12), delete (409 while tickets/epics exist, §4/§9); no-op rename doesn't bump modified_at (§6 rule generalized).
  - **Acceptance:** §4: empty-after-trim name → 400; case-variant duplicate → 409; delete with children → 409 envelope; timestamps ISO-8601 UTC (§9).
  - **Tests first:** supertest — full matrix above incl. rename-to-own-name-different-case succeeds; unauthenticated → 401.
  - **Files:** `backend/src/routes/teams.ts`, `backend/src/validation/teams.ts`, `backend/test/teams.test.ts`.
- [x] **S3.2 Teams UI** *(est. 1.5h)*
  - **Goal:** Wireframe-4 table (Name, Tickets, Epics, Modified, Edit/Delete), create form, delete disabled at counts>0 with caption + 409 handled anyway (stale counts), rename inline/modal.
  - **Acceptance:** §4, §10: validation messages visible; counts from API; loading/empty states (§11).
  - **Files:** `frontend/src/pages/Teams.tsx`, `frontend/src/api/teams.ts`.

## Slice 4 — Epics (est. 3h)

- [x] **S4.1 Epics API** *(est. 1.5h)*
  - **Goal:** `GET /api/epics?teamId=` (title + `_count` tickets + description), create (team immutable after, §5), edit title/description, delete → 409 while referenced (§5/§9); no-op edit rule.
  - **Acceptance:** §5: empty title → 400; team change attempt → 400; delete referenced → 409.
  - **Tests first:** supertest matrix incl. immutable-team and 409 path.
  - **Files:** `backend/src/routes/epics.ts`, `backend/src/validation/epics.ts`, `backend/test/epics.test.ts`.
- [x] **S4.2 Epics UI** *(est. 1.5h)*
  - **Goal:** Wireframe-5: team selector (name-asc, from URL ?team=), table (Title, Tickets, Modified, description preview), create bound to selected team (shown read-only), edit panel (Title, Description, Cancel/Save), delete disabled while referenced; zero-teams empty state → link to Teams.
  - **Acceptance:** §5, §10; screen team-scoped; no team field in edit.
  - **Files:** `frontend/src/pages/Epics.tsx`, `frontend/src/api/epics.ts`.

## Slice 5 — Tickets & comments (est. 6h)

- [x] **S5.1 Tickets API** *(est. 3h)*
  - **Goal:** `GET /api/tickets?teamId=` (ADR-7), `GET/POST/PATCH/DELETE /api/tickets/:id`. PATCH = ADR-5 merged-state validation: enums (§6), team exists, epic null-or-same-team-as-merged-team → 400; **no-op saves don't bump modified_at, real changes do** (§6); modified_at = created_at on create; delete cascades comments (§6); created_by from session.
  - **Acceptance:** §6 field table exactly; cross-team epic → 400 (never 409); drag payload `{state}` alone works; state accepted on create (any of five, default new).
  - **Tests first:** supertest — the full §6 matrix: each invalid enum, dangling team/epic, cross-team epic on create AND on team-change PATCH, no-op PATCH leaves modified_at identical, real PATCH bumps it, comment-add leaves it (with S5.3), delete removes comments.
  - **Files:** `backend/src/routes/tickets.ts`, `backend/src/validation/tickets.ts`, `backend/test/tickets.test.ts`.
- [x] **S5.2 Ticket detail/create UI** *(est. 2h)*
  - **Goal:** Wireframe-3: metadata line (#id, created by/at, modified at — absolute UTC), Team/Type/State/Epic dropdowns (human labels §6; epic list scoped to selected team; team change resets epic to None §6), Title, Body (plain text, pre-wrap), Save (stays on page, updates stamps), Delete (confirm → board); /tickets/new variant (team pre-filled from board, state=new, no metadata/comments).
  - **Acceptance:** §6, §10, wireframe-3 implied items; epic dropdown never shows another team's epics.
  - **Files:** `frontend/src/pages/TicketDetail.tsx`, `frontend/src/api/tickets.ts`, `frontend/src/lib/labels.ts` (enum↔label mapping, ADR spec-analysis).
- [x] **S5.3 Comments API + panel** *(est. 1h)*
  - **Goal:** `GET/POST /api/tickets/:id/comments` — non-empty body, author=session user, oldest-first (created asc, id asc); immutable (§7). Panel: count, list (author email + timestamp), add box; posting refreshes list only, never the ticket form or modified_at (§7).
  - **Tests first:** supertest — comment add leaves ticket modified_at byte-identical (§7 — the subtle one); ordering; empty body → 400.
  - **Files:** `backend/src/routes/comments.ts`, `backend/test/comments.test.ts`, `frontend/src/components/CommentsPanel.tsx`.

## Slice 6 — Kanban board (est. 6h) — **risk #2**

- [x] **S6.1 Board rendering + filters** *(est. 3h)*
  - **Goal:** Wireframe-1: 5 columns (workflow order, human labels, per-column counts), cards (type badge, title, epic name, relative modified time), team selector from URL (ADR/register: /board/:teamId, default first team), filter bar (search substring CI, type, epic incl. "No epic", Clear, filtered count) — all client-side AND-combined (ADR-7); zero-teams and zero-tickets empty states; + New ticket → /tickets/new; card click → detail.
  - **Acceptance:** §8: columns exactly five; ordering modified-desc, tie-break id desc; usable at 100 tickets (manual check with QA-created data); counts = visible set.
  - **Tests first:** unit — pure filter/sort functions (AND logic, CI substring, tie-break).
  - **Files:** `frontend/src/pages/Board.tsx`, `frontend/src/components/{Column,TicketCard,FilterBar}.tsx`, `frontend/src/lib/boardFilters.ts` (+ tests).
- [x] **S6.2 Drag-and-drop** *(est. 3h)*
  - **Goal:** ADR-10/11/14: dnd-kit draggable cards / droppable columns / DragOverlay; drop → optimistic top-of-destination + `PATCH {state}` via TanStack onMutate/onError/onSettled; failure → snapshot revert + toast; 404 → toast + invalidate; in-flight card undraggable; same-column drop = no-op.
  - **Acceptance:** §6 immediate persistence; §8 revert + error on failure; §13 board matches post-refresh truth after any drag.
  - **Tests first:** unit — optimistic cache updater + rollback function; (E2E failure-path in S7).
  - **Files:** `frontend/src/components/BoardDnd.tsx`, `frontend/src/api/tickets.ts` (mutation), `frontend/src/components/Toast.tsx`.

## Slice 7 — E2E, hardening, DoD sweep (est. 3h)

- [x] **S7.1 Playwright E2E** *(est. 2h)*
  - **Goal:** The §11 "frontend flow": signup → fetch token from Mailpit API → verify → login → create team → epic → ticket → drag to In progress → refresh → still there (§13 ✓6) → comment visible. Plus the §8 failure path: route-intercept PATCH → 500 → card reverts + error shown.
  - **Files:** `e2e/happy.spec.ts`, `e2e/drag-failure.spec.ts`, `playwright.config.ts`.
- [x] **S7.2 DoD sweep + docs** *(est. 1h)*
  - **Goal:** Walk §13 checkboxes 1–10 literally on a clean clone (`git clone` → `docker compose up --build`); README testing section; confirm no secret/seed/env committed (§11, §9); ARCHITECTURE.md/DATA_MODEL.md drift check.
  - **Acceptance:** every §13 box demonstrably checkable by QA on a clean laptop.

## Slice 8 — Stretch (only after §13 is fully green, §14)

- [x] S8.1 Edit/delete own comments (§7/§14 — lowest-risk stretch)
- [x] S8.3 Virtualized board rendering (§14)
- [x] S8.4 Password reset flow (§14)

## Slice 9 — Angular twin (est. ~19h) — post-DoD stretch, ADR-18

Full-parity second frontend consuming docs/openapi.yaml via a GENERATED client
(ng-openapi-gen), Angular 20 + signals + Material + CDK (ADR-18). Acceptance oracle:
the existing Playwright suite runs against :8081 as a second project. Promoted from
S8.2 by explicit decision — not a silent reorder.

- [x] **S9.1 Scaffold, generated client, Docker/compose** *(est. 2.5h)*
  - **Goal:** Angular 20 standalone app in frontend-angular/ (replacing the stub);
    Material + CDK; `npm run generate:api` → ng-openapi-gen emits typed services/models
    from ../docs/openapi.yaml into src/app/api/ (committed); multi-stage Dockerfile +
    nginx.conf mirroring frontend/ (SPA fallback, /api proxy); compose profile gains
    depends_on backend.
  - **Acceptance:** `docker compose --profile angular up --build -d` serves the shell
    at :8081; deep-route refresh works; /api/health reachable through :8081; generated
    client compiles; regenerating after a yaml edit shows a diff.
  - **Files:** frontend-angular/* (fresh), docker-compose.yml.
- [x] **S9.2 Auth screens + session plumbing** *(est. 3h)*
  - **Goal:** login (+resend prompt on 403 EMAIL_NOT_VERIFIED), signup, verify,
    forgot-/reset-password (S8.4 parity); functional guards (RequireAuth /
    RedirectIfAuthed equivalents); 401 interceptor → /login; auth state as a signal
    service over the generated AuthService.
  - **Acceptance:** §3/§10 flows work through :8081; labels/headings/button names
    match the React app's accessible names (E2E compatibility, ADR-18).
- [x] **S9.3 Teams + Epics screens** *(est. 3h)*
  - **Goal:** wireframe-4/5 parity: tables with counts, create/rename dialogs
    (role-correct MatDialog), delete disabled while referenced + 409 handling,
    ?team= URL state on epics.
  - **Acceptance:** §4/§5 flows through :8081; happy.spec.ts team/epic steps pass.
- [x] **S9.4 Ticket detail/create + comments** *(est. 3h)*
  - **Goal:** wireframe-3 parity incl. team-change-clears-epic (§6), metadata line,
    confirm-delete (alertdialog); comments panel with add + edit/delete own
    (S8.1 parity, "(edited)" marker, ownership-gated controls).
  - **Acceptance:** §6/§7 flows through :8081; comment steps of happy.spec.ts pass.
- [x] **S9.5 Board rendering, filters, virtual scroll** *(est. 3h)*
  - **Goal:** 5 columns, fixed-height cards in cdk-virtual-scroll-viewport per column
    (S8.3 parity; testids column-STATE / column-scroll-STATE / card-N), client-side
    AND filters + counts (port boardFilters.ts pure functions), empty states.
  - **Acceptance:** virtualization.spec.ts passes against :8081 (bounded DOM at 300).
- [ ] **S9.6 Board drag-and-drop** *(est. 3h)*
  - **Goal:** cdkDropList connected columns, drop index ignored (ADR-11/18);
    optimistic move + targeted revert on failure + MatSnackBar error (role=alert);
    404 → refetch; in-flight card locked; cdkDragPreview carries
    data-testid="drag-overlay".
  - **Acceptance:** happy.spec.ts drag steps + drag-failure.spec.ts pass on :8081.
- [ ] **S9.7 E2E parity project + docs + DoD sweep** *(est. 2h)*
  - **Goal:** playwright.config.ts `angular` project (baseURL :8081, webServer note:
    profile must be up); reconcile residual selector divergences twin-side; README
    (run/test instructions), ARCHITECTURE.md (twin no longer a stub), PLAN checkboxes.
  - **Acceptance:** `npx playwright test` green on BOTH projects (8 spec-runs) from
    a clean `docker compose --profile angular up --build`.

---

## §13 Definition-of-Done coverage map

| §13 checkbox | Delivered by |
|---|---|
| 1 signup→email→verify→login | S1.1–S1.3, S2.1–S2.2 |
| 2 teams & epics managed + persist | S3, S4 |
| 3 ticket CRUD | S5.1, S5.2 |
| 4 comments with author+timestamp | S5.3 |
| 5 board shows correct columns/team | S6.1 |
| 6 drag persists + survives refresh | S6.2, S7.1 |
| 7 clean-checkout compose up | S0.2, S7.2 (scaffold ✅ already) |
| 8 no hardcoded secrets | S7.2 (ADR-12/13 defaults are dev-only) |
| 9 fresh DB empty | S0.1, S7.2 |
| 10 QA creates all data via UI/API | consequence of 1–6 |
