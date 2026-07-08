import { describe, it, expect } from 'vitest';
import { filterTickets, sortBoard, groupByState } from './board-filters';
import { STATE_ORDER } from './labels';
import { Ticket } from '../api/models/ticket';

function mkTicket(overrides: Partial<Ticket> & { id: number }): Ticket {
  return {
    teamId: 1,
    epicId: null,
    type: 'bug',
    state: 'new',
    title: 'Untitled',
    body: 'body',
    createdAt: '2026-01-01T00:00:00.000Z',
    modifiedAt: '2026-01-01T00:00:00.000Z',
    createdBy: { id: 1, email: 'a@example.com' },
    ...overrides,
  };
}

const EMPTY_FILTERS = { search: '', type: null, epic: null } as const;

describe('filterTickets', () => {
  it('passes everything through with empty filters', () => {
    const tickets = [mkTicket({ id: 1 }), mkTicket({ id: 2 })];
    expect(filterTickets(tickets, EMPTY_FILTERS)).toHaveLength(2);
  });

  it('matches title by case-insensitive substring', () => {
    const tickets = [mkTicket({ id: 1, title: 'Fix Login Bug' }), mkTicket({ id: 2, title: 'Add export' })];
    expect(filterTickets(tickets, { ...EMPTY_FILTERS, search: 'login' })).toEqual([tickets[0]]);
  });

  it('returns nothing when the search has no match', () => {
    const tickets = [mkTicket({ id: 1, title: 'Fix Login Bug' })];
    expect(filterTickets(tickets, { ...EMPTY_FILTERS, search: 'zzz' })).toEqual([]);
  });

  it('filters by type', () => {
    const tickets = [mkTicket({ id: 1, type: 'bug' }), mkTicket({ id: 2, type: 'feature' })];
    expect(filterTickets(tickets, { ...EMPTY_FILTERS, type: 'feature' })).toEqual([tickets[1]]);
  });

  it('filters by a specific epic id', () => {
    const tickets = [mkTicket({ id: 1, epicId: 10 }), mkTicket({ id: 2, epicId: 20 })];
    expect(filterTickets(tickets, { ...EMPTY_FILTERS, epic: 10 })).toEqual([tickets[0]]);
  });

  it('filters by epic: "none" for tickets without an epic', () => {
    const tickets = [mkTicket({ id: 1, epicId: null }), mkTicket({ id: 2, epicId: 20 })];
    expect(filterTickets(tickets, { ...EMPTY_FILTERS, epic: 'none' })).toEqual([tickets[0]]);
  });

  it('combines search, type, and epic with AND logic', () => {
    const tickets = [
      mkTicket({ id: 1, title: 'Fix login', type: 'bug', epicId: 10 }),
      mkTicket({ id: 2, title: 'Fix login', type: 'feature', epicId: 10 }),
      mkTicket({ id: 3, title: 'Fix login', type: 'bug', epicId: 20 }),
    ];
    expect(filterTickets(tickets, { search: 'login', type: 'bug', epic: 10 })).toEqual([tickets[0]]);
  });
});

describe('sortBoard', () => {
  it('sorts by modifiedAt descending', () => {
    const older = mkTicket({ id: 1, modifiedAt: '2026-01-01T00:00:00.000Z' });
    const newer = mkTicket({ id: 2, modifiedAt: '2026-01-02T00:00:00.000Z' });
    expect([older, newer].sort(sortBoard)).toEqual([newer, older]);
  });

  it('breaks ties on equal modifiedAt by id descending', () => {
    const a = mkTicket({ id: 1, modifiedAt: '2026-01-01T00:00:00.000Z' });
    const b = mkTicket({ id: 2, modifiedAt: '2026-01-01T00:00:00.000Z' });
    expect([a, b].sort(sortBoard)).toEqual([b, a]);
  });
});

describe('groupByState', () => {
  it('returns all five state keys, in STATE_ORDER, even when empty', () => {
    const groups = groupByState([]);
    expect(Object.keys(groups)).toEqual(STATE_ORDER);
    for (const state of STATE_ORDER) expect(groups[state]).toEqual([]);
  });

  it('places each ticket in its own state\'s group', () => {
    const t1 = mkTicket({ id: 1, state: 'new' });
    const t2 = mkTicket({ id: 2, state: 'done' });
    const groups = groupByState([t1, t2]);
    expect(groups.new).toEqual([t1]);
    expect(groups.done).toEqual([t2]);
    expect(groups.in_progress).toEqual([]);
  });

  it('sorts each group by modifiedAt descending', () => {
    const older = mkTicket({ id: 1, state: 'new', modifiedAt: '2026-01-01T00:00:00.000Z' });
    const newer = mkTicket({ id: 2, state: 'new', modifiedAt: '2026-01-02T00:00:00.000Z' });
    const groups = groupByState([older, newer]);
    expect(groups.new).toEqual([newer, older]);
  });
});
