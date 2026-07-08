import { Component, computed, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TYPE_LABELS } from '../../lib/labels';
import { formatRelative } from '../../lib/dates';
import { Ticket } from '../../api/models/ticket';
import { Epic } from '../../api/models/epic';

@Component({
  selector: 'app-ticket-card',
  imports: [RouterLink],
  templateUrl: './ticket-card.html',
  styleUrl: './ticket-card.scss',
})
export class TicketCard {
  readonly ticket = input.required<Ticket>();
  readonly epics = input<Epic[]>([]);

  readonly TYPE_LABELS = TYPE_LABELS;
  readonly formatRelative = formatRelative;

  readonly epicName = computed<string | undefined>(() => {
    const id = this.ticket().epicId;
    if (id === null) return undefined;
    return this.epics().find((e) => e.id === id)?.title;
  });
}
