import { useQuery } from "@tanstack/react-query";
import { api } from "./client";
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
export const ticketKey = (id: number) => ["ticket", id] as const;

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
    queryFn: teamId === null ? undefined : () => listTickets(teamId),
    enabled: teamId !== null,
  });
}

export function useTicket(id: number | null) {
  return useQuery({
    queryKey: id === null ? ["ticket", null] : ticketKey(id),
    queryFn: id === null ? undefined : () => getTicket(id),
    enabled: id !== null,
  });
}
