import type { Ticket } from "../api/tickets";
import type { TicketState } from "./labels";

// Optimistic move (ADR-10): a successful drag bumps modifiedAt server-side, which
// (via groupByState's per-column sort) floats the card to the top of its destination —
// exactly what a refresh would show (§13). `now` is a parameter, not read internally,
// so tests can assert on an exact, deterministic timestamp.
export function applyOptimisticMove(
  tickets: Ticket[],
  ticketId: number,
  newState: TicketState,
  now: string
): Ticket[] {
  return tickets.map((t) =>
    t.id === ticketId ? { ...t, state: newState, modifiedAt: now } : t
  );
}
