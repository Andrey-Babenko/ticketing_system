import { Component, inject, signal } from '@angular/core';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { TeamsStore } from '../../core/teams.service';
import { toApiError } from '../../core/api-error';
import { Team } from '../../api/models/team';

export type TeamFormDialogData =
  | { mode: 'create'; initialName: '' }
  | { mode: 'edit'; teamId: number; initialName: string };

@Component({
  selector: 'app-team-form-dialog',
  imports: [MatDialogModule, MatFormFieldModule, MatInputModule, MatButtonModule],
  templateUrl: './team-form-dialog.html',
  styleUrl: './team-form-dialog.scss',
})
export class TeamFormDialog {
  private readonly store = inject(TeamsStore);
  readonly dialogRef = inject(MatDialogRef<TeamFormDialog, Team | undefined>);
  readonly data = inject<TeamFormDialogData>(MAT_DIALOG_DATA);

  readonly name = signal(this.data.initialName);
  readonly pending = signal(false);
  readonly errorMessage = signal<string | undefined>(undefined);

  async submit() {
    this.pending.set(true);
    this.errorMessage.set(undefined);
    try {
      const team =
        this.data.mode === 'edit'
          ? await this.store.rename(this.data.teamId, this.name())
          : await this.store.create(this.name());
      this.dialogRef.close(team);
    } catch (e) {
      this.errorMessage.set(toApiError(e).message);
    } finally {
      this.pending.set(false);
    }
  }
}
