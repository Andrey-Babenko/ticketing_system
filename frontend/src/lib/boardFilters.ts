import { STATE_ORDER } from "./labels";
import type { TicketState, TicketType } from "./labels";
import type { Ticket } from "../api/tickets";

export interface Filters {
  search: string;
  type: TicketType | null;
  epic: number | "none" | null;
}

export const EMPTY_FILTERS: Filters = { search: "", type: null, epic: null };

// §8: AND-combined, client-side (ADR-7).
export function filterTickets(tickets: Ticket[], filters: Filters): Ticket[] {
  const needle = filters.search.trim().toLowerCase();
  return tickets.filter((t) => {
    if (needle && !t.title.toLowerCase().includes(needle)) return false;
    if (filters.type && t.type !== filters.type) return false;
    if (filters.epic === "none" && t.epicId !== null) return false;
    if (typeof filters.epic === "number" && t.epicId !== filters.epic) return false;
    return true;
  });
}

// §8: most-recently-modified first; id desc breaks ties deterministically (shared with
// the backend's ORDER BY, and with the optimistic-move placement in boardDnd.ts).
export function sortBoard(a: Ticket, b: Ticket): number {
  const byModified = Date.parse(b.modifiedAt) - Date.parse(a.modifiedAt);
  return byModified !== 0 ? byModified : b.id - a.id;
}

export function groupByState(tickets: Ticket[]): Record<TicketState, Ticket[]> {
  const groups = Object.fromEntries(STATE_ORDER.map((s) => [s, [] as Ticket[]])) as Record<
    TicketState,
    Ticket[]
  >;
  for (const t of tickets) groups[t.state].push(t);
  for (const state of STATE_ORDER) groups[state].sort(sortBoard);
  return groups;
}
