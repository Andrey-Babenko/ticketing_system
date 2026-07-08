import { Component, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { MatDialog } from '@angular/material/dialog';
import { TeamsStore } from '../../core/teams.service';
import { EpicsStore } from '../../core/epics.service';
import { TicketsStore } from '../../core/tickets.service';
import { ApiError, toApiError } from '../../core/api-error';
import { formatUtc } from '../../lib/dates';
import { parseCanonicalId } from '../../lib/ids';
import { STATE_LABELS, STATE_ORDER, TYPE_LABELS, TYPE_ORDER, TicketState, TicketType } from '../../lib/labels';
import { Ticket } from '../../api/models/ticket';
import { ConfirmDialog, ConfirmDialogData } from '../../components/confirm-dialog/confirm-dialog';
import { CommentsPanel } from '../../components/comments-panel/comments-panel';

@Component({
  selector: 'app-ticket-detail',
  imports: [RouterLink, MatFormFieldModule, MatInputModule, MatButtonModule, CommentsPanel],
  templateUrl: './ticket-detail.html',
  styleUrl: './ticket-detail.scss',
})
export class TicketDetail {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly teamsStore = inject(TeamsStore);
  private readonly epicsStore = inject(EpicsStore);
  private readonly ticketsStore = inject(TicketsStore);
  private readonly dialog = inject(MatDialog);

  readonly STATE_ORDER = STATE_ORDER;
  readonly STATE_LABELS = STATE_LABELS;
  readonly TYPE_ORDER = TYPE_ORDER;
  readonly TYPE_LABELS = TYPE_LABELS;
  readonly formatUtc = formatUtc;

  readonly isCreate = this.route.snapshot.data['create'] === true;
  private readonly ticketId = this.isCreate ? null : parseCanonicalId(this.route.snapshot.paramMap.get('id'));

  readonly teams = this.teamsStore.teams;
  readonly teamsLoading = signal(true);
  readonly teamsError = signal(false);

  readonly ticket = signal<Ticket | null>(null); // stays null in create mode
  readonly ticketLoading = signal(!this.isCreate);
  readonly ticketNotFound = signal(!this.isCreate && this.ticketId === null);

  readonly teamId = signal<number | null>(null);
  readonly epicId = signal<number | null>(null);
  readonly type = signal<TicketType>('bug');
  readonly state = signal<TicketState>('new');
  readonly title = signal('');
  readonly body = signal('');

  readonly pending = signal(false);
  readonly deleting = signal(false);
  readonly apiError = signal<ApiError | null>(null);
  readonly removeError = signal<string | null>(null);

  readonly epics = computed(() => {
    const id = this.teamId();
    return id === null ? undefined : this.epicsStore.epicsFor(id)();
  });

  readonly backTeamId = computed(() => this.ticket()?.teamId ?? this.teamId());
  readonly backTeamName = computed(
    () => this.teams()?.find((t) => t.id === this.backTeamId())?.name ?? 'board',
  );

  constructor() {
    this.teamsStore
      .load()
      .then((teams) => {
        if (this.isCreate && teams.length > 0 && this.teamId() === null) {
          const raw = this.route.snapshot.queryParamMap.get('team');
          const prefill = raw ? Number(raw) : NaN;
          this.teamId.set(teams.find((t) => t.id === prefill)?.id ?? teams[0].id);
        }
      })
      .catch(() => this.teamsError.set(true))
      .finally(() => this.teamsLoading.set(false));

    if (!this.isCreate && this.ticketId !== null) {
      this.ticketsStore
        .get(this.ticketId)
        .then((t) => {
          this.ticket.set(t);
          this.teamId.set(t.teamId);
          this.epicId.set(t.epicId);
          this.type.set(t.type);
          this.state.set(t.state);
          this.title.set(t.title);
          this.body.set(t.body);
        })
        .catch(() => this.ticketNotFound.set(true))
        .finally(() => this.ticketLoading.set(false));
    }
  }

  onTeamChange(idStr: string) {
    this.teamId.set(Number(idStr)); // §6: changing team clears the selected epic
    this.epicId.set(null);
  }

  onEpicChange(idStr: string) {
    this.epicId.set(idStr === '' ? null : Number(idStr));
  }

  fieldError(name: string): string | undefined {
    const err = this.apiError();
    return err?.field === name ? err.message : undefined;
  }

  formError(): string | undefined {
    const err = this.apiError();
    if (!err) return undefined;
    return ['title', 'body', 'epicId', 'teamId'].includes(err.field ?? '') ? undefined : err.message;
  }

  async submit() {
    const teamId = this.teamId();
    if (teamId === null) return;
    this.pending.set(true);
    this.apiError.set(null);
    const data = {
      teamId,
      epicId: this.epicId(),
      type: this.type(),
      state: this.state(),
      title: this.title(),
      body: this.body(),
    };
    try {
      const current = this.ticket();
      const saved = current
        ? await this.ticketsStore.update(current.id, data, current.teamId)
        : await this.ticketsStore.create(data);
      if (!current) {
        this.router.navigateByUrl(`/board/${saved.teamId}`);
      } else {
        this.ticket.set(saved);
      }
    } catch (e) {
      this.apiError.set(toApiError(e));
    } finally {
      this.pending.set(false);
    }
  }

  confirmDelete() {
    const t = this.ticket();
    if (!t) return;
    const ref = this.dialog.open<ConfirmDialog, ConfirmDialogData, boolean>(ConfirmDialog, {
      role: 'alertdialog',
      data: {
        title: 'Delete ticket',
        message: `Delete ticket #${t.id} ${t.title}? Its comments are deleted with it. This cannot be undone.`,
      },
    });
    ref.afterClosed().subscribe(async (confirmed) => {
      if (!confirmed) return;
      this.deleting.set(true);
      try {
        await this.ticketsStore.remove(t);
        this.router.navigateByUrl(`/board/${t.teamId}`);
      } catch (e) {
        this.removeError.set(toApiError(e).message);
      } finally {
        this.deleting.set(false);
      }
    });
  }
}
