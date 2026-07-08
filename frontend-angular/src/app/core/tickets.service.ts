import { Injectable, Signal, WritableSignal, inject, signal } from '@angular/core';
import { TicketsService as TicketsApi } from '../api/services/tickets.service';
import { Ticket } from '../api/models/ticket';
import { TicketCreate } from '../api/models/ticket-create';
import { TicketUpdate } from '../api/models/ticket-update';
import { TeamsStore } from './teams.service';
import { EpicsStore } from './epics.service';

interface Entry {
  tickets: WritableSignal<Ticket[] | undefined>;
  inflight: Promise<Ticket[]> | null;
}

// Named TicketsStore (not TicketsService) to avoid colliding with the generated
// api/services/tickets.service.ts — per-team cached-signal store (ADR-18).
@Injectable({ providedIn: 'root' })
export class TicketsStore {
  private readonly api = inject(TicketsApi);
  private readonly teamsStore = inject(TeamsStore);
  private readonly epicsStore = inject(EpicsStore);
  private readonly cache = new Map<number, Entry>();

  private entry(teamId: number): Entry {
    let e = this.cache.get(teamId);
    if (!e) {
      e = { tickets: signal(undefined), inflight: null };
      this.cache.set(teamId, e);
    }
    return e;
  }

  ticketsFor(teamId: number): Signal<Ticket[] | undefined> {
    const e = this.entry(teamId);
    if (e.tickets() === undefined && !e.inflight) {
      e.inflight = this.api
        .listTickets({ teamId })
        .then((list) => {
          e.tickets.set(list);
          return list;
        })
        .finally(() => {
          e.inflight = null;
        });
    }
    return e.tickets;
  }

  async refetchTeam(teamId: number): Promise<void> {
    const list = await this.api.listTickets({ teamId });
    this.entry(teamId).tickets.set(list);
  }

  get(id: number): Promise<Ticket> {
    return this.api.getTicket({ id });
  }

  async create(data: TicketCreate): Promise<Ticket> {
    const ticket = await this.api.createTicket({ body: data });
    await this.afterWrite(ticket);
    return ticket;
  }

  async update(id: number, data: TicketUpdate, previousTeamId?: number): Promise<Ticket> {
    const ticket = await this.api.updateTicket({ id, body: data });
    await this.afterWrite(ticket, previousTeamId);
    return ticket;
  }

  async remove(ticket: Ticket): Promise<void> {
    await this.api.deleteTicket({ id: ticket.id });
    await Promise.all([
      this.refetchTeam(ticket.teamId),
      this.teamsStore.refetch(),
      this.epicsStore.refetch(ticket.teamId),
    ]);
  }

  // Ticket writes can change Team/Epic counts (the disabled-delete affordance), so
  // both lists refetch alongside the team's ticket list (React invalidateAfterTicketWrite parity).
  private async afterWrite(ticket: Ticket, previousTeamId?: number): Promise<void> {
    const refetches = [this.refetchTeam(ticket.teamId), this.teamsStore.refetch(), this.epicsStore.refetch(ticket.teamId)];
    if (previousTeamId !== undefined && previousTeamId !== ticket.teamId) {
      refetches.push(this.refetchTeam(previousTeamId), this.epicsStore.refetch(previousTeamId));
    }
    await Promise.all(refetches);
  }
}
