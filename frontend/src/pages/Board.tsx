import { useState } from "react";
import { Link, Navigate, useNavigate, useParams } from "react-router";
import { useTeams } from "../api/teams";
import { useEpics } from "../api/epics";
import { useTickets } from "../api/tickets";
import { filterTickets, groupByState } from "../lib/boardFilters";
import type { Filters } from "../lib/boardFilters";
import { STATE_ORDER } from "../lib/labels";
import Column from "../components/Column";
import TicketCard from "../components/TicketCard";
import FilterBar from "../components/FilterBar";

// Same non-coercing canonical-id guard as TicketDetail (review finding there):
// '/board/1e2' must not silently resolve to team 1.
function parseCanonicalId(raw: string | undefined): number | null {
  if (!raw || !/^[1-9][0-9]*$/.test(raw)) return null;
  return Number(raw);
}

const EMPTY_FILTERS: Filters = { search: "", type: null, epic: null };

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

  return <BoardForTeam teamId={team.id} filters={filters} onFiltersChange={setFilters} />;
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

  const epicName = (epicId: number | null) =>
    epicId === null ? undefined : epics?.find((e) => e.id === epicId)?.title;

  const filtered = tickets ? filterTickets(tickets, filters) : [];
  const groups = groupByState(filtered);

  return (
    <div className="flex h-full flex-col">
      <div className="mb-3 flex items-center justify-between gap-4">
        <select
          value={teamId}
          onChange={(e) => navigate(`/board/${e.target.value}`)}
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
        <div className="flex flex-1 gap-3 overflow-x-auto pb-2">
          {STATE_ORDER.map((state) => (
            <Column key={state} state={state} count={groups[state].length}>
              {groups[state].map((ticket) => (
                <TicketCard key={ticket.id} ticket={ticket} epicName={epicName(ticket.epicId)} />
              ))}
            </Column>
          ))}
        </div>
      )}
    </div>
  );
}
