# Design — Prod email config path (relay1) via `.env`

Date: 2026-07-08
Status: Approved (brainstorming) — ready for implementation plan
Scope: documented convention only (spec §14 keeps real prod infra out of scope)

## Problem

The backend can already send real email — [`backend/src/lib/mailer.ts`](../../../backend/src/lib/mailer.ts)
reads `SMTP_HOST/PORT/SECURE/USER/PASS/FROM` from `process.env`. But two of those
knobs are **hardcoded** in `docker-compose.yml`:

```yaml
SMTP_HOST: mailpit    # pinned — .env cannot override
SMTP_PORT: "1025"     # pinned
```

so there is no way to point the compose stack at `relay1.dataart.com` (spec §3
requires the relay be supportable) without editing the compose file by hand. There
is also no recorded decision about **where SMTP secrets live** in a prod-style run.

## Goal

Make the backend SMTP target switchable between **Mailpit (default)** and
**`relay1.dataart.com`** with a single compose flag, keep real credentials out of
git, and record the decision — all without new application code.

## Non-goals (explicitly deferred, recorded in ADR-19)

- Host-dev (`npm run dev`) honoring `.env` — the backend has no `dotenv`; host-dev
  reads only the shell environment. Out of scope by decision (Docker-only switch).
- Docker Compose `secrets:` / a `SMTP_PASS_FILE` code path — nodemailer reads
  `process.env`, not files, so this needs an app-code change. Named as the future
  hardening step, not built.
- Orchestrator manifests (k8s/ECS/Vault), DNS/SPF/DKIM, production deployment
  (spec §14).

## Decision: where SMTP secrets live

SMTP secrets are **ordinary environment variables injected at deploy time**:

- **Local / manual prod-style run:** an **uncommitted `.env.relay1`** file, fed to
  compose via `docker compose --env-file .env.relay1 up`. `.env*` is already
  gitignored (except `.env.example`), so real credentials are never committed.
- **Real production:** the orchestrator's secret store (k8s Secret / ECS Secrets
  Manager / Vault) injects the same `SMTP_*` variables — identical contract, no
  code change.

Rejected / deferred alternatives:
- **Docker Compose `secrets:`** (files under `/run/secrets/`): more secure at rest
  but requires a `SMTP_PASS_FILE` read path in `mailer.ts` — deferred hardening.
- **Committed encrypted secrets (SOPS / sealed-secrets):** over-scoped for a
  hackathon; revisit only if env injection is outgrown.

## Changes

1. **`docker-compose.yml`** — interpolate the two pinned lines; defaults unchanged:
   ```yaml
   SMTP_HOST: ${SMTP_HOST:-mailpit}
   SMTP_PORT: ${SMTP_PORT:-1025}
   ```
   Mailpit remains the zero-config default. Nothing else in compose changes.

2. **`.env.relay1.example`** (new, committed) — template with relay1 vars and empty
   credential fields:
   ```
   SMTP_HOST=relay1.dataart.com
   SMTP_PORT=587           # 587 = STARTTLS; 465 = implicit TLS
   SMTP_SECURE=false       # true only for 465
   SMTP_USER=              # fill only if the relay authenticates
   SMTP_PASS=
   SMTP_FROM=you@dataart.com
   APP_BASE_URL=http://localhost:8080
   ```
   The real `.env.relay1` stays uncommitted.

3. **`docs/DECISIONS.md`** — new **ADR-19: SMTP secrets are env vars injected at
   deploy time** (the "Decision" section above), citing §3, §11, §14.

4. **`README.md`** — a "Sending real email (relay1)" subsection: the two run
   commands (mailpit default vs `--env-file .env.relay1`), the shell-var
   precedence gotcha, and "never commit `.env.relay1`."

5. **`docs/ARCHITECTURE.md`** — one-line note in the env-vars table that
   `SMTP_HOST/PORT` are now overridable. (They were *described* as overridable but
   were actually pinned — this closes a real doc/reality drift.)

6. **`docs/PLAN.md`** — add **S8.5 Prod email config path (relay1) — ADR-19** under
   Slice 8 (stretch); check off when the above lands.

## Testing / verification

No app code changes, so no unit/E2E tests. Verify config resolution instead:

- `docker compose config` → `SMTP_HOST` still resolves to `mailpit` (default intact).
- `docker compose --env-file .env.relay1 config | grep SMTP` → vars flip to relay1.

This proves the switch without needing a live relay connection.

## The `.env` mechanics (reference, for the README section)

- Compose auto-reads a file named exactly `.env` for **interpolation** of `${VAR}`
  placeholders in `docker-compose.yml`. It does **not** auto-inject into containers;
  values reach a container only through `environment:`/`env_file:`.
- `${VAR:-default}` = use `VAR` if set, else `default` — this is why the stack runs
  with zero `.env` today.
- `--env-file <path>` swaps *which* file feeds interpolation (default `.env`).
- A real shell var (`export SMTP_HOST=…`) overrides the `.env` file during
  interpolation.
