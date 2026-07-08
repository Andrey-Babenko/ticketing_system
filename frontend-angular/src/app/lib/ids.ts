// The backend 404s non-canonical ids ('1e2', '010'); the SPA must not Number()-coerce
// them into different, existing resources. null = no valid id. Shared by every page
// that reads an id out of a route param (TicketDetail, Board).
export function parseCanonicalId(raw: string | undefined | null): number | null {
  if (!raw || !/^[1-9][0-9]*$/.test(raw)) return null;
  return Number(raw);
}
