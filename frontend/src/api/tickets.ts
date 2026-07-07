import { skipToken, useQuery } from "@tanstack/react-query";
import type { QueryClient } from "@tanstack/react-query";
import { api } from "./client";
import { teamsKey } from "./teams";
import { epicsKey } from "./epics";
import type { TicketType, TicketState } from "../lib/labels";

export interface Ticket {
  id: number;
  teamId: number;
  epicId: number | null;
  type: TicketType;
  state: TicketState;
  title: string;
  body: string;
  createdAt: string;
  modifiedAt: string;
  createdBy: { id: number; email: string };
}

export interface TicketCreate {
  teamId: number;
  type: TicketType;
  state: TicketState;
  epicId: number | null;
  title: string;
  body: string;
}

export type TicketUpdate = Partial<TicketCreate>;

export const ticketsKey = (teamId: number | null) => ["tickets", teamId] as const;
export const ticketKey = (id: number | null) => ["ticket", id] as const;

export const listTickets = (teamId: number) => api<Ticket[]>(`/tickets?teamId=${teamId}`);
export const getTicket = (id: number) => api<Ticket>(`/tickets/${id}`);
export const createTicket = (data: TicketCreate) =>
  api<Ticket>("/tickets", { method: "POST", body: JSON.stringify(data) });
export const updateTicket = (id: number, data: TicketUpdate) =>
  api<Ticket>(`/tickets/${id}`, { method: "PATCH", body: JSON.stringify(data) });
export const deleteTicket = (id: number) =>
  api<undefined>(`/tickets/${id}`, { method: "DELETE" });

export function useTickets(teamId: number | null) {
  return useQuery({
    queryKey: ticketsKey(teamId),
    queryFn: teamId === null ? skipToken : () => listTickets(teamId),
  });
}

export function useTicket(id: number | null) {
  return useQuery({
    queryKey: ticketKey(id),
    queryFn: id === null ? skipToken : () => getTicket(id),
  });
}

// One place that knows which caches a ticket write dirties: the team's board list
// (old AND new team on a move), the single-ticket entry, and — because ticket rows
// drive Team/Epic counts (the disabled-Delete affordance) — the teams and epics lists.
// S6.2's drag mutation must use these too.
export function invalidateAfterTicketWrite(
  queryClient: QueryClient,
  saved: Ticket,
  previousTeamId?: number
) {
  queryClient.invalidateQueries({ queryKey: ticketsKey(saved.teamId) });
  if (previousTeamId !== undefined && previousTeamId !== saved.teamId) {
    queryClient.invalidateQueries({ queryKey: ticketsKey(previousTeamId) });
    queryClient.invalidateQueries({ queryKey: epicsKey(previousTeamId) });
  }
  queryClient.setQueryData(ticketKey(saved.id), saved);
  queryClient.invalidateQueries({ queryKey: teamsKey });
  queryClient.invalidateQueries({ queryKey: epicsKey(saved.teamId) });
}

export function invalidateAfterTicketDelete(queryClient: QueryClient, ticket: Ticket) {
  queryClient.invalidateQueries({ queryKey: ticketsKey(ticket.teamId) });
  queryClient.removeQueries({ queryKey: ticketKey(ticket.id) });
  queryClient.invalidateQueries({ queryKey: teamsKey });
  queryClient.invalidateQueries({ queryKey: epicsKey(ticket.teamId) });
}
