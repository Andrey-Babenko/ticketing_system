import { Component, inject, signal } from '@angular/core';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { EpicsStore } from '../../core/epics.service';
import { toApiError } from '../../core/api-error';
import { Epic } from '../../api/models/epic';

export type EpicFormDialogData =
  | { mode: 'create'; teamId: number; teamName: string }
  | { mode: 'edit'; epicId: number; teamId: number; originalTitle: string; initialTitle: string; initialDescription: string };

@Component({
  selector: 'app-epic-form-dialog',
  imports: [MatDialogModule, MatFormFieldModule, MatInputModule, MatButtonModule],
  templateUrl: './epic-form-dialog.html',
  styleUrl: './epic-form-dialog.scss',
})
export class EpicFormDialog {
  private readonly store = inject(EpicsStore);
  readonly dialogRef = inject(MatDialogRef<EpicFormDialog, Epic | undefined>);
  readonly data = inject<EpicFormDialogData>(MAT_DIALOG_DATA);

  readonly title = signal(this.data.mode === 'edit' ? this.data.initialTitle : '');
  readonly description = signal(this.data.mode === 'edit' ? this.data.initialDescription : '');
  readonly pending = signal(false);
  readonly titleError = signal<string | undefined>(undefined);
  readonly descriptionError = signal<string | undefined>(undefined);
  readonly formError = signal<string | undefined>(undefined);

  async submit() {
    this.pending.set(true);
    this.titleError.set(undefined);
    this.descriptionError.set(undefined);
    this.formError.set(undefined);
    try {
      const epic =
        this.data.mode === 'edit'
          ? await this.store.update(this.data.epicId, this.data.teamId, {
              title: this.title(),
              description: this.description(),
            })
          : await this.store.create(this.data.teamId, { title: this.title(), description: this.description() });
      this.dialogRef.close(epic);
    } catch (e) {
      const err = toApiError(e);
      if (err.field === 'title') this.titleError.set(err.message);
      else if (err.field === 'description') this.descriptionError.set(err.message);
      else this.formError.set(err.message);
    } finally {
      this.pending.set(false);
    }
  }
}
