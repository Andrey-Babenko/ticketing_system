import { Component, computed, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatSnackBar } from '@angular/material/snack-bar';
import { CdkDragDrop, DragDropModule } from '@angular/cdk/drag-drop';
import { TeamsStore } from '../../core/teams.service';
import { EpicsStore } from '../../core/epics.service';
import { TicketsStore } from '../../core/tickets.service';
import { toApiError } from '../../core/api-error';
import { EMPTY_FILTERS, Filters, filterTickets, groupByState } from '../../lib/board-filters';
import { STATE_ORDER, TicketState } from '../../lib/labels';
import { Team } from '../../api/models/team';
import { Ticket } from '../../api/models/ticket';
import { FilterBar } from '../../components/filter-bar/filter-bar';
import { BoardColumn } from '../../components/board-column/board-column';
import { ErrorSnack } from '../../components/error-snack/error-snack';

@Component({
  selector: 'app-board',
  imports: [RouterLink, MatButtonModule, DragDropModule, FilterBar, BoardColumn],
  templateUrl: './board.html',
  styleUrl: './board.scss',
})
export class Board {
  private readonly teamsStore = inject(TeamsStore);
  private readonly epicsStore = inject(EpicsStore);
  private readonly ticketsStore = inject(TicketsStore);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly snackBar = inject(MatSnackBar);

  readonly STATE_ORDER = STATE_ORDER;

  readonly teams = this.teamsStore.teams;
  readonly loading = signal(true);
  readonly loadError = signal(false);
  readonly filters = signal<Filters>(EMPTY_FILTERS);

  private readonly paramMap = toSignal(this.route.paramMap);

  readonly selectedTeam = computed<Team | null>(() => {
    const teams = this.teams();
    if (!teams || teams.length === 0) return null;
    const raw = this.paramMap()?.get('teamId');
    const id = raw ? Number(raw) : NaN;
    return teams.find((t) => t.id === id) ?? teams[0];
  });

  readonly epics = computed(() => {
    const team = this.selectedTeam();
    return team ? this.epicsStore.epicsFor(team.id)() : undefined;
  });

  readonly tickets = computed(() => {
    const team = this.selectedTeam();
    return team ? this.ticketsStore.ticketsFor(team.id)() : undefined;
  });

  readonly filteredTickets = computed(() => {
    const tickets = this.tickets();
    return tickets ? filterTickets(tickets, this.filters()) : [];
  });

  readonly groups = computed(() => groupByState(this.filteredTickets()));

  readonly pendingIds = signal<ReadonlySet<number>>(new Set());

  constructor() {
    this.teamsStore
      .load()
      .catch(() => this.loadError.set(true))
      .finally(() => this.loading.set(false));
  }

  onTeamChange(idStr: string) {
    // Reset filters on team switch — a filter scoped to the old team's data (e.g. a
    // specific epic id) would otherwise silently carry over into the new team.
    this.filters.set(EMPTY_FILTERS);
    this.router.navigate(['/board', idStr]);
  }

  // ADR-10: optimistic move + targeted revert on failure. A 404 (ticket deleted
  // elsewhere) refetches instead of resurrecting the ticket; any other failure reverts
  // just this one ticket's row, never a full-list snapshot restore.
  onDropped(event: CdkDragDrop<TicketState, TicketState, Ticket>) {
    const fromState = event.previousContainer.data;
    const toState = event.container.data;
    if (fromState === toState) return; // same-column drop — no API call (§8)

    const team = this.selectedTeam();
    const ticket = event.item.data;
    if (!team) return;

    this.pendingIds.update((prev) => new Set(prev).add(ticket.id));
    const previous = this.ticketsStore.optimisticMove(team.id, ticket.id, toState, new Date().toISOString());

    this.ticketsStore
      .moveState(ticket.id, toState)
      .then((saved) => {
        this.ticketsStore.setTicketInCache(team.id, saved);
      })
      .catch((e) => {
        const err = toApiError(e);
        if (err.status === 404) {
          this.ticketsStore.refetchTeam(team.id);
          this.showError('This ticket was deleted.');
          return;
        }
        if (previous) this.ticketsStore.setTicketInCache(team.id, previous);
        this.showError("Couldn't move the ticket — try again.");
      })
      .finally(() => {
        this.pendingIds.update((prev) => {
          const next = new Set(prev);
          next.delete(ticket.id);
          return next;
        });
      });
  }

  private showError(message: string) {
    this.snackBar.openFromComponent(ErrorSnack, { data: message, duration: 5000 });
  }
}
