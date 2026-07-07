import { useRef, useState } from "react";
import { Link, Navigate, useNavigate, useParams } from "react-router";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import type { DragEndEvent, DragStartEvent } from "@dnd-kit/core";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useTeams } from "../api/teams";
import { useEpics } from "../api/epics";
import { useTickets, updateTicket, ticketsKey, ticketKey } from "../api/tickets";
import type { Ticket } from "../api/tickets";
import { ApiError } from "../api/client";
import { filterTickets, groupByState, EMPTY_FILTERS } from "../lib/boardFilters";
import type { Filters } from "../lib/boardFilters";
import { applyOptimisticMove } from "../lib/boardDnd";
import { parseCanonicalId } from "../lib/ids";
import { STATE_ORDER } from "../lib/labels";
import type { TicketState } from "../lib/labels";
import Column from "../components/Column";
import TicketCard, { TicketCardBody } from "../components/TicketCard";
import FilterBar from "../components/FilterBar";
import Toast from "../components/Toast";

export default function Board() {
  const params = useParams();
  const { data: teams, isPending: teamsPending, isError: teamsError } = useTeams();
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS);

  if (teamsPending) return <p className="py-8 text-center text-sm text-gray-500">Loading…</p>;
  if (teamsError)
    return <p className="py-8 text-center text-sm text-red-600">Could not load teams.</p>;

  if (teams.length === 0) {
    return (
      <div className="mx-auto w-full max-w-3xl">
        <h1 className="mb-4 text-xl font-semibold text-gray-900">Board</h1>
        <p className="rounded border border-dashed border-gray-300 py-8 text-center text-sm text-gray-500">
          No teams yet.{" "}
          <Link to="/teams" className="font-medium text-blue-700 hover:underline">
            Create a team first
          </Link>
          .
        </p>
      </div>
    );
  }

  const requestedId = parseCanonicalId(params.teamId);
  const team = teams.find((t) => t.id === requestedId) ?? teams[0];
  // Canonicalize: no param, or a param that doesn't match a real team → the URL for team[0].
  if (requestedId !== team.id) return <Navigate to={`/board/${team.id}`} replace />;

  // key={team.id}: force a full remount on team switch (review finding) — otherwise
  // useMoveTicket's mutation callbacks keep closing over whatever teamId the LATEST
  // render passed, so a drag started on team A that settles after switching to team B
  // would write A's result into B's cache. Remounting means an in-flight mutation's
  // callbacks stay bound to the team it actually started on.
  return (
    <BoardForTeam key={team.id} teamId={team.id} filters={filters} onFiltersChange={setFilters} />
  );
}

// Board-local. onError distinguishes a 404 (ticket deleted elsewhere — refetch, never
// resurrect, ADR-10) from any other failure (targeted per-ticket revert, §8). The revert
// is targeted (not a full-list snapshot restore) so a failed drag can never clobber a
// different ticket's already-succeeded concurrent move (review finding) — it re-reads
// the CURRENT cache via the setQueryData updater form and only touches the one ticket.
// Intentionally NOT invalidateAfterTicketWrite (tickets.ts's shared helper): a
// state-only move changes no Team/Epic counts, and invalidating those lists would
// refetch the mounted Teams/Epics selectors on every drag for no visible reason.
function useMoveTicket(teamId: number, onFailure: (message: string) => void) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, state }: { id: number; state: TicketState }) => updateTicket(id, { state }),
    onMutate: async ({ id, state }) => {
      await queryClient.cancelQueries({ queryKey: ticketsKey(teamId) });
      const previousList = queryClient.getQueryData<Ticket[]>(ticketsKey(teamId));
      const previousTicket = previousList?.find((t) => t.id === id);
      if (previousList) {
        queryClient.setQueryData(
          ticketsKey(teamId),
          applyOptimisticMove(previousList, id, state, new Date().toISOString())
        );
      }
      return { previousTicket };
    },
    onError: (err, vars, context) => {
      if (err instanceof ApiError && err.status === 404) {
        queryClient.invalidateQueries({ queryKey: ticketsKey(teamId) });
        onFailure("This ticket was deleted.");
        return;
      }
      // Targeted revert of just this ticket's row against the CURRENT cache (the
      // updater form re-reads it at call time) — never a full-list snapshot restore,
      // which would clobber a different ticket's already-succeeded concurrent drag.
      const reverted = context?.previousTicket;
      if (reverted) {
        queryClient.setQueryData<Ticket[]>(ticketsKey(teamId), (current) =>
          current?.map((t) => (t.id === vars.id ? reverted : t))
        );
      }
      onFailure("Couldn't move the ticket — try again.");
    },
    onSuccess: (saved) => {
      queryClient.setQueryData(ticketKey(saved.id), saved);
      queryClient.setQueryData<Ticket[]>(ticketsKey(teamId), (old) =>
        old?.map((t) => (t.id === saved.id ? saved : t))
      );
    },
  });
}

function BoardForTeam({
  teamId,
  filters,
  onFiltersChange,
}: {
  teamId: number;
  filters: Filters;
  onFiltersChange: (f: Filters) => void;
}) {
  const navigate = useNavigate();
  const { data: teams } = useTeams();
  const { data: epics } = useEpics(teamId);
  const { data: tickets, isPending, isError } = useTickets(teamId);

  const [activeTicket, setActiveTicket] = useState<Ticket | null>(null);
  const [pendingIds, setPendingIds] = useState<ReadonlySet<number>>(new Set());
  const [toast, setToast] = useState<string | null>(null);
  // A drag's pointerup can still fire the dragged card's onClick; Board sets this for
  // one tick so TicketCard can suppress that one navigation (not a re-render — read at
  // click-time, not render-time).
  const justDraggedRef = useRef<number | null>(null);

  const moveTicket = useMoveTicket(teamId, setToast);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } })
  );

  const epicName = (epicId: number | null) =>
    epicId === null ? undefined : epics?.find((e) => e.id === epicId)?.title;

  const filtered = tickets ? filterTickets(tickets, filters) : [];
  const groups = groupByState(filtered);

  function handleDragStart(event: DragStartEvent) {
    setActiveTicket(tickets?.find((t) => t.id === event.active.id) ?? null);
  }

  function handleDragEnd(event: DragEndEvent) {
    setActiveTicket(null);
    const { active, over } = event;
    const ticketId = active.id as number;
    // Any real drag (regardless of outcome — no-op included) can leave a trailing
    // click on the dragged card once the pointer releases; set this unconditionally,
    // before any early return, so every outcome suppresses it (review finding: the
    // early returns below used to skip this, leaving no-op drags unsuppressed).
    // TicketCard consumes-and-clears it inside onClick rather than us clearing it on a
    // timer, which would race a click that doesn't fire in the same task (review finding).
    justDraggedRef.current = ticketId;

    if (!over) return; // dropped outside any column — §8/ADR-10 no-op
    const newState = over.id as TicketState;
    const ticket = tickets?.find((t) => t.id === ticketId);
    if (!ticket || ticket.state === newState) return; // same-column drop — no API call

    setPendingIds((prev) => new Set(prev).add(ticketId));
    moveTicket.mutate(
      { id: ticketId, state: newState },
      {
        onSettled: () =>
          setPendingIds((prev) => {
            const next = new Set(prev);
            next.delete(ticketId);
            return next;
          }),
      }
    );
  }

  return (
    <div className="flex h-full flex-col">
      <div className="mb-3 flex items-center justify-between gap-4">
        <select
          value={teamId}
          onChange={(e) => {
            // Reset filters on team switch (review finding) — a filter scoped to the
            // old team's data (e.g. a specific epic id) would otherwise silently carry
            // over and could filter out all of the new team's tickets with no
            // indication why the board looks empty.
            onFiltersChange(EMPTY_FILTERS);
            navigate(`/board/${e.target.value}`);
          }}
          className="rounded border border-gray-300 bg-white px-2 py-1.5 text-sm font-medium"
        >
          {teams?.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </select>
        <Link
          to={`/tickets/new?team=${teamId}`}
          className="rounded bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700"
        >
          + New ticket
        </Link>
      </div>

      <FilterBar
        filters={filters}
        onChange={onFiltersChange}
        epics={epics ?? []}
        visibleCount={filtered.length}
      />

      {isPending ? (
        <p className="py-8 text-center text-sm text-gray-500">Loading tickets…</p>
      ) : isError ? (
        <p className="py-8 text-center text-sm text-red-600">Could not load tickets.</p>
      ) : tickets.length === 0 ? (
        <p className="rounded border border-dashed border-gray-300 py-8 text-center text-sm text-gray-500">
          No tickets yet — create the first one above.
        </p>
      ) : (
        <DndContext sensors={sensors} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
          <div className="flex flex-1 gap-3 overflow-x-auto pb-2">
            {STATE_ORDER.map((state) => (
              <Column key={state} state={state} count={groups[state].length}>
                {groups[state].map((ticket) => (
                  <TicketCard
                    key={ticket.id}
                    ticket={ticket}
                    epicName={epicName(ticket.epicId)}
                    disabled={pendingIds.has(ticket.id)}
                    justDraggedRef={justDraggedRef}
                  />
                ))}
              </Column>
            ))}
          </div>
          <DragOverlay>
            {activeTicket && (
              <div className="w-64 rounded border border-blue-300 bg-white p-3 shadow-lg">
                <TicketCardBody ticket={activeTicket} epicName={epicName(activeTicket.epicId)} />
              </div>
            )}
          </DragOverlay>
        </DndContext>
      )}

      {toast && <Toast message={toast} onDismiss={() => setToast(null)} />}
    </div>
  );
}
