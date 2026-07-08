# Data Model

Draft of `backend/prisma/schema.prisma` — the authoritative copy lives there once Slice 0
lands; keep this file in sync (PLAN S0.1). Decisions encoded: ADR-4 (int IDs), ADR-8
(sessions), ADR-9 (verification columns on User, raw token — **no** separate token table),
ADR-12 (case-insensitive uniqueness).

## Schema draft

```prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

// §6 — exactly these values; API and DB share the canonical strings
enum TicketType {
  bug
  feature
  fix
}

enum TicketState {
  new
  ready_for_implementation
  in_progress
  ready_for_acceptance
  done
}

model User {
  id                         Int       @id @default(autoincrement())
  email                      String    @unique // stored trimmed + lowercased (ADR-12, §3)
  passwordHash               String    // Argon2id (§3); never returned by the API
  emailVerifiedAt            DateTime? // null = unverified; gates login (ADR-3)
  verificationToken          String?   @unique // raw 32-byte base64url (ADR-9)
  verificationTokenExpiresAt DateTime? // issuance + 24h (§3)
  resetTokenHash             String?   @unique // sha256(token) — never raw (S8.4, ADR-17)
  resetTokenExpiresAt        DateTime? // issuance + 1h (ADR-17)
  createdAt                  DateTime  @default(now())

  sessions Session[]
  tickets  Ticket[]  @relation("TicketCreator")
  comments Comment[]
}

model Session {
  id        String   @id // opaque 32-byte crypto-random base64url (ADR-8); never in URLs (§9)
  userId    Int
  user      User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  expiresAt DateTime // rolling 7-day, extended at most once/day; expired rows deleted lazily
  createdAt DateTime @default(now())

  @@index([userId])
}

model Team {
  id         Int      @id @default(autoincrement())
  name       String   // display case preserved; CI uniqueness via lower(name) index below (ADR-12)
  createdAt  DateTime @default(now())
  modifiedAt DateTime @default(now()) // explicitly server-set — see "modifiedAt" note

  epics   Epic[]
  tickets Ticket[]
}

model Epic {
  id          Int      @id @default(autoincrement())
  teamId      Int      // immutable after create (§5) — enforced in the API layer
  team        Team     @relation(fields: [teamId], references: [id], onDelete: Restrict)
  title       String   // non-empty after trim (§5); duplicates allowed (spec-analysis)
  description String?
  createdAt   DateTime @default(now())
  modifiedAt  DateTime @default(now())

  tickets Ticket[]

  @@index([teamId])
}

model Ticket {
  id          Int         @id @default(autoincrement())
  teamId      Int
  team        Team        @relation(fields: [teamId], references: [id], onDelete: Restrict)
  epicId      Int?        // nullable (§6); must belong to teamId — see invariant note
  epic        Epic?       @relation(fields: [epicId], references: [id], onDelete: Restrict)
  type        TicketType
  state       TicketState @default(new)
  title       String      // non-empty after trim (§6)
  body        String      // non-empty; rendered as escaped plain text (spec-analysis)
  createdById Int
  createdBy   User        @relation("TicketCreator", fields: [createdById], references: [id], onDelete: Restrict)
  createdAt   DateTime    @default(now())
  modifiedAt  DateTime    @default(now()) // = createdAt at birth; bumped only on real change (§6)

  comments Comment[]

  @@index([teamId])
  @@index([epicId])
}

model Comment {
  id        Int      @id @default(autoincrement())
  ticketId  Int
  ticket    Ticket   @relation(fields: [ticketId], references: [id], onDelete: Cascade) // §6: delete ticket → delete comments
  authorId  Int
  author    User     @relation(fields: [authorId], references: [id], onDelete: Restrict)
  body      String   // non-empty (§7)
  createdAt DateTime @default(now())
  editedAt  DateTime? // null = never edited; set on every successful edit (S8.1, ADR-15)

  @@index([ticketId])
}
```

## Hand-added migration SQL (ADR-12)

Prisma cannot express functional indexes; added once via `migrate dev --create-only`:

```sql
CREATE UNIQUE INDEX team_name_ci ON "Team" (lower(name));
```

A comment in `schema.prisma` marks its existence. Violations are caught by an app-level
pre-check (friendly 409, excluding self on rename) with the index as the race-safe backstop.

## Referential-integrity map (§4, §5, §6, §9)

| Relation | onDelete | Why |
|---|---|---|
| Team → Epic, Team → Ticket | **Restrict** | §4: no cascading team delete; API pre-checks counts → 409, DB restricts as backstop |
| Epic → Ticket | **Restrict** | §5: epic undeletable while referenced → 409 |
| Ticket → Comment | **Cascade** | §6: deleting a ticket deletes its comments |
| User → Session | Cascade | Hygiene; user deletion is out of scope anyway (§12) |
| User → Ticket/Comment | Restrict | `created_by`/author must stay resolvable; user deletion out of scope |

## Invariants the schema cannot express (enforced in the API layer, test-covered)

1. **Cross-team epic** (§6): `ticket.epicId` must reference an epic with the ticket's
   (merged) `teamId` — validated on create and on every PATCH against the merged result
   (ADR-5). A composite FK (`Ticket(epicId, teamId) → Epic(id, teamId)`) could enforce this
   in Postgres, but sharing `teamId` between two Prisma relations is friction we deliberately
   skip; the app check + §6 test matrix is authoritative (PLAN S5.1).
2. **`modifiedAt` semantics** (§6, §7): deliberately **not** `@updatedAt` — Prisma would bump
   it on *any* row write. Instead the service layer compares incoming vs stored values,
   skips the write entirely on no-ops, and sets `modifiedAt` explicitly on real changes.
   Comments never write the ticket row at all.
3. **Epic team immutability** (§5): PATCH schema for epics simply has no `teamId` field.
4. **Trim-then-validate** (§4–§7): all names/titles/bodies trimmed before the non-empty
   check; emails trimmed + lowercased before every read or write (ADR-12).
