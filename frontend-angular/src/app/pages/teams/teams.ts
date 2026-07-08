import { Component, OnInit, inject, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatDialog } from '@angular/material/dialog';
import { TeamsStore } from '../../core/teams.service';
import { toApiError } from '../../core/api-error';
import { formatRelative } from '../../lib/dates';
import { Team } from '../../api/models/team';
import { TeamFormDialog, TeamFormDialogData } from '../../components/team-form-dialog/team-form-dialog';
import { ConfirmDialog, ConfirmDialogData } from '../../components/confirm-dialog/confirm-dialog';

@Component({
  selector: 'app-teams',
  imports: [MatButtonModule],
  templateUrl: './teams.html',
  styleUrl: './teams.scss',
})
export class Teams implements OnInit {
  private readonly store = inject(TeamsStore);
  private readonly dialog = inject(MatDialog);

  readonly teams = this.store.teams;
  readonly loading = signal(true);
  readonly loadError = signal(false);
  readonly removeError = signal<string | null>(null);

  readonly formatRelative = formatRelative;

  ngOnInit() {
    this.store
      .load()
      .catch(() => this.loadError.set(true))
      .finally(() => this.loading.set(false));
  }

  isBusy(team: Team): boolean {
    return team.ticketCount > 0 || team.epicCount > 0;
  }

  openCreate() {
    this.dialog.open<TeamFormDialog, TeamFormDialogData, Team | undefined>(TeamFormDialog, {
      data: { mode: 'create', initialName: '' },
    });
  }

  openEdit(team: Team) {
    this.dialog.open<TeamFormDialog, TeamFormDialogData, Team | undefined>(TeamFormDialog, {
      data: { mode: 'edit', teamId: team.id, initialName: team.name },
    });
  }

  openDelete(team: Team) {
    this.removeError.set(null);
    const ref = this.dialog.open<ConfirmDialog, ConfirmDialogData, boolean>(ConfirmDialog, {
      role: 'alertdialog',
      data: { title: 'Delete team', message: `Delete team "${team.name}"? This cannot be undone.` },
    });
    ref.afterClosed().subscribe(async (confirmed) => {
      if (!confirmed) return;
      try {
        await this.store.remove(team.id);
      } catch (e) {
        this.removeError.set(toApiError(e).message);
      }
    });
  }
}
