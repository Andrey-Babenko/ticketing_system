import { Component, input } from '@angular/core';
import { ScrollingModule } from '@angular/cdk/scrolling';
import { TicketCard } from '../ticket-card/ticket-card';
import { STATE_LABELS, TicketState } from '../../lib/labels';
import { Ticket } from '../../api/models/ticket';
import { Epic } from '../../api/models/epic';

// S8.3/ADR-16: CDK's fixed-size virtual scroll windows the card list so DOM size stays
// bounded regardless of ticket count (verified at 1,000/team). `column-<state>` is the
// whole column shell (header + cards), the sole droppable region in S9.6; the inner
// `column-scroll-<state>` viewport is the actual scrollable element tests scroll.
@Component({
  selector: 'app-board-column',
  imports: [ScrollingModule, TicketCard],
  templateUrl: './board-column.html',
  styleUrl: './board-column.scss',
})
export class BoardColumn {
  readonly state = input.required<TicketState>();
  readonly tickets = input.required<Ticket[]>();
  readonly epics = input<Epic[]>([]);

  readonly STATE_LABELS = STATE_LABELS;

  trackById(_index: number, ticket: Ticket): number {
    return ticket.id;
  }
}
