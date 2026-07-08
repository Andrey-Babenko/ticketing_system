import { Component, computed, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { TeamsStore } from '../../core/teams.service';
import { EpicsStore } from '../../core/epics.service';
import { TicketsStore } from '../../core/tickets.service';
import { EMPTY_FILTERS, Filters, filterTickets, groupByState } from '../../lib/board-filters';
import { STATE_ORDER } from '../../lib/labels';
import { Team } from '../../api/models/team';
import { FilterBar } from '../../components/filter-bar/filter-bar';
import { BoardColumn } from '../../components/board-column/board-column';

@Component({
  selector: 'app-board',
  imports: [RouterLink, MatButtonModule, FilterBar, BoardColumn],
  templateUrl: './board.html',
  styleUrl: './board.scss',
})
export class Board {
  private readonly teamsStore = inject(TeamsStore);
  private readonly epicsStore = inject(EpicsStore);
  private readonly ticketsStore = inject(TicketsStore);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);

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
}
