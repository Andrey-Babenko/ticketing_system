// The backend 404s non-canonical ids ('1e2', '010'); the SPA must not Number()-coerce
// them into different, existing resources. null = no valid id. Shared by every page
// that reads an id out of a route param (TicketDetail, Board) — was duplicated
// verbatim in both before a code-review finding flagged it (Slice 6 review).
export function parseCanonicalId(raw: string | undefined): number | null {
  if (!raw || !/^[1-9][0-9]*$/.test(raw)) return null;
  return Number(raw);
}
