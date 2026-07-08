import { Component, computed, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatDialog } from '@angular/material/dialog';
import { TeamsStore } from '../../core/teams.service';
import { EpicsStore } from '../../core/epics.service';
import { toApiError } from '../../core/api-error';
import { formatRelative } from '../../lib/dates';
import { Epic } from '../../api/models/epic';
import { Team } from '../../api/models/team';
import { EpicFormDialog, EpicFormDialogData } from '../../components/epic-form-dialog/epic-form-dialog';
import { ConfirmDialog, ConfirmDialogData } from '../../components/confirm-dialog/confirm-dialog';

@Component({
  selector: 'app-epics',
  imports: [RouterLink, MatButtonModule],
  templateUrl: './epics.html',
  styleUrl: './epics.scss',
})
export class Epics {
  private readonly teamsStore = inject(TeamsStore);
  private readonly epicsStore = inject(EpicsStore);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly dialog = inject(MatDialog);

  readonly teams = this.teamsStore.teams;
  readonly teamsLoading = signal(true);
  readonly teamsLoadError = signal(false);
  readonly removeError = signal<string | null>(null);

  private readonly queryParams = toSignal(this.route.queryParamMap);

  private readonly paramTeamId = computed<number | null>(() => {
    const raw = this.queryParams()?.get('team');
    const id = raw ? Number(raw) : NaN;
    return Number.isFinite(id) ? id : null;
  });

  // The screen is team-scoped (§5, wireframe 5); the selection lives in the URL.
  readonly selectedTeam = computed<Team | null>(() => {
    const teams = this.teams();
    if (!teams || teams.length === 0) return null;
    return teams.find((t) => t.id === this.paramTeamId()) ?? teams[0];
  });

  readonly epics = computed<Epic[] | undefined>(() => {
    const team = this.selectedTeam();
    return team ? this.epicsStore.epicsFor(team.id)() : undefined;
  });

  readonly formatRelative = formatRelative;

  constructor() {
    this.teamsStore
      .load()
      .catch(() => this.teamsLoadError.set(true))
      .finally(() => this.teamsLoading.set(false));
  }

  onTeamChange(idStr: string) {
    this.router.navigate([], { queryParams: { team: idStr } });
  }

  openCreate() {
    const team = this.selectedTeam();
    if (!team) return;
    this.dialog.open<EpicFormDialog, EpicFormDialogData, Epic | undefined>(EpicFormDialog, {
      data: { mode: 'create', teamId: team.id, teamName: team.name },
    });
  }

  openEdit(epic: Epic) {
    this.dialog.open<EpicFormDialog, EpicFormDialogData, Epic | undefined>(EpicFormDialog, {
      data: {
        mode: 'edit',
        epicId: epic.id,
        teamId: epic.teamId,
        originalTitle: epic.title,
        initialTitle: epic.title,
        initialDescription: epic.description ?? '',
      },
    });
  }

  openDelete(epic: Epic) {
    this.removeError.set(null);
    const ref = this.dialog.open<ConfirmDialog, ConfirmDialogData, boolean>(ConfirmDialog, {
      role: 'alertdialog',
      data: { title: 'Delete epic', message: `Delete epic "${epic.title}"? This cannot be undone.` },
    });
    ref.afterClosed().subscribe(async (confirmed) => {
      if (!confirmed) return;
      try {
        await this.epicsStore.remove(epic.id, epic.teamId);
      } catch (e) {
        this.removeError.set(toApiError(e).message);
      }
    });
  }
}
