import { Prisma } from "@prisma/client";

// P2002 unique violation, P2003 FK restrict, P2025 record-not-found — the three
// race backstops the CRUD routes map to contract responses.
export function isPrismaError(e: unknown, code: string): boolean {
  return e instanceof Prisma.PrismaClientKnownRequestError && e.code === code;
}
