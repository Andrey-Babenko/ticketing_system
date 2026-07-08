import { describe, it, expect } from 'vitest';
import { applyOptimisticMove } from './board-dnd';
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

describe('applyOptimisticMove', () => {
  it("updates only the target ticket's state and modifiedAt", () => {
    const now = '2026-06-01T00:00:00.000Z';
    const moved = mkTicket({ id: 1, state: 'new' });
    const other = mkTicket({ id: 2, state: 'new' });
    const result = applyOptimisticMove([moved, other], 1, 'in_progress', now);

    const movedResult = result.find((t) => t.id === 1)!;
    const otherResult = result.find((t) => t.id === 2)!;
    expect(movedResult.state).toBe('in_progress');
    expect(movedResult.modifiedAt).toBe(now);
    expect(otherResult).toEqual(other); // untouched
  });

  it('returns a new array (does not mutate the input)', () => {
    const now = '2026-06-01T00:00:00.000Z';
    const tickets = [mkTicket({ id: 1, state: 'new' })];
    const result = applyOptimisticMove(tickets, 1, 'done', now);
    expect(result).not.toBe(tickets);
    expect(tickets[0].state).toBe('new'); // original untouched
  });

  it('leaves the list unchanged when the id is unknown', () => {
    const now = '2026-06-01T00:00:00.000Z';
    const tickets = [mkTicket({ id: 1, state: 'new' })];
    const result = applyOptimisticMove(tickets, 999, 'done', now);
    expect(result).toEqual(tickets);
  });

  it("floats the moved ticket to the top of its new state's group", () => {
    const now = '2026-06-01T00:00:00.000Z';
    const older = mkTicket({ id: 1, state: 'done', modifiedAt: '2026-01-01T00:00:00.000Z' });
    const moved = mkTicket({ id: 2, state: 'new', modifiedAt: '2026-01-01T00:00:00.000Z' });
    const result = applyOptimisticMove([older, moved], 2, 'done', now);
    const movedResult = result.find((t) => t.id === 2)!;
    expect(Date.parse(movedResult.modifiedAt)).toBeGreaterThan(Date.parse(older.modifiedAt));
  });
});
