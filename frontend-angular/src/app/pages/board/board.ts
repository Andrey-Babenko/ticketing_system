import { Component, computed, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { TeamsStore } from '../../core/teams.service';
import { Team } from '../../api/models/team';

@Component({
  selector: 'app-board',
  imports: [RouterLink, MatButtonModule],
  templateUrl: './board.html',
  styleUrl: './board.scss',
})
export class Board {
  private readonly teamsStore = inject(TeamsStore);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);

  readonly teams = this.teamsStore.teams;
  readonly loading = signal(true);
  readonly loadError = signal(false);

  private readonly paramMap = toSignal(this.route.paramMap);

  readonly selectedTeam = computed<Team | null>(() => {
    const teams = this.teams();
    if (!teams || teams.length === 0) return null;
    const raw = this.paramMap()?.get('teamId');
    const id = raw ? Number(raw) : NaN;
    return teams.find((t) => t.id === id) ?? teams[0];
  });

  constructor() {
    this.teamsStore
      .load()
      .catch(() => this.loadError.set(true))
      .finally(() => this.loading.set(false));
  }

  onTeamChange(idStr: string) {
    this.router.navigate(['/board', idStr]);
  }
}
