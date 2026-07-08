import { Component, computed, input, model } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { EMPTY_FILTERS, Filters } from '../../lib/board-filters';
import { TYPE_LABELS, TYPE_ORDER, TicketType } from '../../lib/labels';
import { Epic } from '../../api/models/epic';

@Component({
  selector: 'app-filter-bar',
  imports: [MatButtonModule],
  templateUrl: './filter-bar.html',
  styleUrl: './filter-bar.scss',
})
export class FilterBar {
  readonly filters = model.required<Filters>();
  readonly epics = input<Epic[]>([]);
  readonly visibleCount = input.required<number>();

  readonly TYPE_ORDER = TYPE_ORDER;
  readonly TYPE_LABELS = TYPE_LABELS;

  readonly isDefault = computed(() => {
    const f = this.filters();
    return f.search === '' && f.type === null && f.epic === null;
  });

  onSearchInput(value: string) {
    this.filters.update((f) => ({ ...f, search: value }));
  }

  onTypeChange(value: string) {
    this.filters.update((f) => ({ ...f, type: (value || null) as TicketType | null }));
  }

  onEpicChange(value: string) {
    this.filters.update((f) => ({
      ...f,
      epic: value === '' ? null : value === 'none' ? 'none' : Number(value),
    }));
  }

  clear() {
    this.filters.set(EMPTY_FILTERS);
  }
}
