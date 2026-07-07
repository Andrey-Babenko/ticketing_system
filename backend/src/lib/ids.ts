// Postgres SERIAL columns are INT4 — anything above this cannot exist as a row id,
// and letting it through makes Prisma throw a non-Known error that surfaces as a 500
// instead of the contract's 404/400 (Slice-4 review finding).
export const INT4_MAX = 2147483647;

// Canonical positive integer only. Regex, not Number(): Number coerces '0x10'/'1e2'/' 5'
// to real ids (Slice-3 review finding). Express 5 types params as string | string[].
export function parsePositiveInt(raw: unknown): number | null {
  if (typeof raw !== "string" || !/^[1-9][0-9]*$/.test(raw)) return null;
  const n = Number(raw);
  return n <= INT4_MAX ? n : null;
}

// Contract lists are ordered case-insensitively; Prisma can't ORDER BY lower(col).
export function compareCi(a: string, b: string): number {
  return a.toLowerCase().localeCompare(b.toLowerCase());
}
