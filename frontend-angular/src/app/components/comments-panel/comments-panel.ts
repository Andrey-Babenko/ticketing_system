import { Component, OnInit, inject, input, signal } from '@angular/core';
import { MatDialog } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { CommentsService } from '../../api/services/comments.service';
import { Comment } from '../../api/models/comment';
import { SessionService } from '../../core/session.service';
import { ApiError, toApiError } from '../../core/api-error';
import { formatUtc } from '../../lib/dates';
import { ConfirmDialog, ConfirmDialogData } from '../confirm-dialog/confirm-dialog';

// §7: fully independent of the ticket form — posting appends to the local comments
// signal only, never touches the ticket; the ticket's modifiedAt must not change.
@Component({
  selector: 'app-comments-panel',
  imports: [MatButtonModule, MatFormFieldModule, MatInputModule],
  templateUrl: './comments-panel.html',
  styleUrl: './comments-panel.scss',
})
export class CommentsPanel implements OnInit {
  private readonly api = inject(CommentsService);
  private readonly session = inject(SessionService);
  private readonly dialog = inject(MatDialog);

  readonly ticketId = input.required<number>();
  readonly formatUtc = formatUtc;

  readonly comments = signal<Comment[] | undefined>(undefined);
  readonly loadError = signal(false);

  readonly newBody = signal('');
  readonly posting = signal(false);
  readonly postError = signal<ApiError | null>(null);

  readonly editingId = signal<number | null>(null);
  readonly draft = signal('');
  readonly editPending = signal(false);
  readonly editError = signal<ApiError | null>(null);
  readonly removeError = signal<string | null>(null);

  ngOnInit() {
    this.api
      .listComments({ id: this.ticketId() })
      .then((list) => this.comments.set(list))
      .catch(() => this.loadError.set(true));
  }

  isOwn(c: Comment): boolean {
    return c.author.id === this.session.user()?.id;
  }

  async post() {
    this.posting.set(true);
    this.postError.set(null);
    try {
      const created = await this.api.createComment({ id: this.ticketId(), body: { body: this.newBody() } });
      this.comments.update((list) => [...(list ?? []), created]);
      this.newBody.set('');
    } catch (e) {
      this.postError.set(toApiError(e));
    } finally {
      this.posting.set(false);
    }
  }

  startEdit(c: Comment) {
    this.editingId.set(c.id);
    this.draft.set(c.body);
    this.editError.set(null);
  }

  cancelEdit() {
    this.editingId.set(null);
  }

  async saveEdit(c: Comment) {
    this.editPending.set(true);
    this.editError.set(null);
    try {
      const updated = await this.api.updateComment({
        id: this.ticketId(),
        commentId: c.id,
        body: { body: this.draft() },
      });
      this.comments.update((list) => (list ?? []).map((x) => (x.id === updated.id ? updated : x)));
      this.editingId.set(null);
    } catch (e) {
      this.editError.set(toApiError(e));
    } finally {
      this.editPending.set(false);
    }
  }

  confirmDelete(c: Comment) {
    this.removeError.set(null);
    const ref = this.dialog.open<ConfirmDialog, ConfirmDialogData, boolean>(ConfirmDialog, {
      role: 'alertdialog',
      data: { title: 'Delete comment', message: 'Delete this comment? This cannot be undone.' },
    });
    ref.afterClosed().subscribe(async (confirmed) => {
      if (!confirmed) return;
      try {
        await this.api.deleteComment({ id: this.ticketId(), commentId: c.id });
        this.comments.update((list) => (list ?? []).filter((x) => x.id !== c.id));
      } catch (e) {
        this.removeError.set(toApiError(e).message);
      }
    });
  }
}
