import { useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router";
import { useMutation } from "@tanstack/react-query";
import { useQueryClient } from "@tanstack/react-query";
import { useTeams } from "../api/teams";
import type { Team } from "../api/teams";
import { useEpics } from "../api/epics";
import {
  useTicket,
  createTicket,
  updateTicket,
  deleteTicket,
  invalidateAfterTicketWrite,
  invalidateAfterTicketDelete,
} from "../api/tickets";
import type { Ticket, TicketCreate } from "../api/tickets";
import { ApiError } from "../api/client";
import { formatUtc } from "../lib/dates";
import { parseCanonicalId } from "../lib/ids";
import { TYPE_LABELS, STATE_LABELS, TYPE_ORDER, STATE_ORDER } from "../lib/labels";
import type { TicketType, TicketState } from "../lib/labels";
import { Field, TextArea, Select, Button } from "../components/ui";
import ConfirmDialog from "../components/ConfirmDialog";
import CommentsPanel from "../components/CommentsPanel";

function Message({ children, error }: { children: React.ReactNode; error?: boolean }) {
  return (
    <p className={`py-8 text-center text-sm ${error ? "text-red-600" : "text-gray-500"}`}>
      {children}
    </p>
  );
}

export default function TicketDetail({ create }: { create?: boolean }) {
  const params = useParams();
  const ticketId = create ? null : parseCanonicalId(params.id);

  const { data: ticket, isPending, isError } = useTicket(ticketId);
  // TicketForm's useState initializers read the teams list on first render, so the
  // form must not mount before teams are available — in either mode.
  const { data: teams, isPending: teamsPending, isError: teamsError } = useTeams();

  if (!create && ticketId === null) return <Message error>Ticket not found.</Message>;
  if (teamsError) return <Message error>Could not load teams — try reloading.</Message>;
  if (teamsPending) return <Message>Loading…</Message>;

  if (create) {
    if (!teams || teams.length === 0)
      return (
        <div className="mx-auto w-full max-w-3xl">
          <h1 className="mb-4 text-xl font-semibold text-gray-900">New ticket</h1>
          <p className="rounded border border-dashed border-gray-300 py-8 text-center text-sm text-gray-500">
            Tickets belong to a team.{" "}
            <Link to="/teams" className="font-medium text-blue-700 hover:underline">
              Create a team first
            </Link>
            .
          </p>
        </div>
      );
    return <TicketForm teams={teams} />;
  }

  if (isPending) return <Message>Loading ticket…</Message>;
  if (isError || !ticket) return <Message error>Ticket not found.</Message>;
  // key: remount the form when a different ticket loads; local field state stays otherwise.
  return <TicketForm key={ticket.id} teams={teams!} ticket={ticket} />;
}

function TicketForm({ teams, ticket }: { teams: Team[]; ticket?: Ticket }) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [search] = useSearchParams();

  // Create mode: team pre-filled from ?team= (the board passes it), else first team.
  // The parent gate guarantees teams is non-empty, so teamId is always a real number.
  const paramTeam = Number(search.get("team"));
  const [teamId, setTeamId] = useState<number>(
    () => ticket?.teamId ?? teams.find((t) => t.id === paramTeam)?.id ?? teams[0].id
  );
  const [epicId, setEpicId] = useState<number | null>(ticket?.epicId ?? null);
  const [type, setType] = useState<TicketType>(ticket?.type ?? "bug");
  const [state, setState] = useState<TicketState>(ticket?.state ?? "new");
  const [title, setTitle] = useState(ticket?.title ?? "");
  const [body, setBody] = useState(ticket?.body ?? "");
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  const { data: epics } = useEpics(teamId);

  const save = useMutation({
    mutationFn: () => {
      const data: TicketCreate = { teamId, epicId, type, state, title, body };
      // ADR-5: send the full editable set; the server validates the merged result and
      // treats an unchanged payload as a no-op (modifiedAt untouched).
      return ticket ? updateTicket(ticket.id, data) : createTicket(data);
    },
    onSuccess: (saved) => {
      invalidateAfterTicketWrite(queryClient, saved, ticket?.teamId);
      if (!ticket) navigate(`/board/${saved.teamId}`); // create lands on the team's board
    },
  });

  const remove = useMutation({
    mutationFn: () => deleteTicket(ticket!.id),
    onSuccess: () => {
      invalidateAfterTicketDelete(queryClient, ticket!);
      navigate(`/board/${ticket!.teamId}`);
    },
    onError: () => setConfirmingDelete(false),
  });

  const saveError = save.error instanceof ApiError ? save.error : undefined;
  const fieldError = (name: string) =>
    saveError?.field === name ? saveError.message : undefined;
  const formError =
    saveError && !["title", "body", "epicId", "teamId"].includes(saveError.field ?? "")
      ? saveError.message
      : undefined;
  const removeError = remove.error instanceof ApiError ? remove.error.message : undefined;

  const backTeamId = ticket?.teamId ?? teamId;
  const backTeamName = teams.find((t) => t.id === backTeamId)?.name ?? "board";

  return (
    <div className="mx-auto w-full max-w-5xl">
      <div className="mb-1">
        <Link
          to={`/board/${backTeamId}`}
          className="text-sm font-medium text-blue-700 hover:underline"
        >
          ← Back to {backTeamName}
        </Link>
      </div>

      <div className="mb-4 flex items-start justify-between gap-4">
        <div>
          {ticket ? (
            <>
              <p className="text-xs text-gray-500">
                #{ticket.id} · Created by {ticket.createdBy.email} · Created{" "}
                {formatUtc(ticket.createdAt)} · Modified {formatUtc(ticket.modifiedAt)}
              </p>
              <h1 className="mt-1 text-xl font-semibold text-gray-900">{ticket.title}</h1>
            </>
          ) : (
            <h1 className="text-xl font-semibold text-gray-900">New ticket</h1>
          )}
        </div>
        <div className="flex shrink-0 gap-2">
          {ticket && (
            <Button
              type="button"
              variant="danger"
              disabled={save.isPending} // never delete while a save is in flight
              onClick={() => setConfirmingDelete(true)}
            >
              Delete
            </Button>
          )}
          <Button
            type="submit"
            form="ticket-form"
            pending={save.isPending}
            pendingLabel="Saving…"
            disabled={remove.isPending}
          >
            {ticket ? "Save" : "Create"}
          </Button>
        </div>
      </div>

      {removeError && (
        <p className="mb-3 rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {removeError}
        </p>
      )}

      <div className="grid gap-6 md:grid-cols-[1fr_minmax(280px,380px)]">
        <form
          id="ticket-form"
          onSubmit={(e) => {
            e.preventDefault();
            save.mutate();
          }}
        >
          <div className="grid gap-x-4 sm:grid-cols-2">
            <Select
              label="Team"
              value={teamId}
              error={fieldError("teamId")}
              onChange={(e) => {
                setTeamId(Number(e.target.value));
                setEpicId(null); // §6: changing team clears the selected epic
              }}
            >
              {teams.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </Select>
            <Select
              label="Type"
              value={type}
              onChange={(e) => setType(e.target.value as TicketType)}
            >
              {TYPE_ORDER.map((t) => (
                <option key={t} value={t}>
                  {TYPE_LABELS[t]}
                </option>
              ))}
            </Select>
            <Select
              label="State"
              value={state}
              onChange={(e) => setState(e.target.value as TicketState)}
            >
              {STATE_ORDER.map((s) => (
                <option key={s} value={s}>
                  {STATE_LABELS[s]}
                </option>
              ))}
            </Select>
            <Select
              label="Epic"
              value={epicId ?? ""}
              error={fieldError("epicId")}
              onChange={(e) => setEpicId(e.target.value === "" ? null : Number(e.target.value))}
            >
              <option value="">No epic</option>
              {epics?.map((epic) => (
                <option key={epic.id} value={epic.id}>
                  {epic.title}
                </option>
              ))}
            </Select>
          </div>
          <Field
            label="Title"
            required
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            error={fieldError("title")}
          />
          <TextArea
            label="Body"
            rows={10}
            required
            value={body}
            onChange={(e) => setBody(e.target.value)}
            error={fieldError("body")}
          />
          {formError && <p className="mb-3 text-sm text-red-600">{formError}</p>}
        </form>

        {ticket && <CommentsPanel ticketId={ticket.id} />}
      </div>

      {ticket && (
        <ConfirmDialog
          open={confirmingDelete}
          title="Delete ticket"
          pending={remove.isPending}
          onConfirm={() => remove.mutate()}
          onCancel={() => setConfirmingDelete(false)}
        >
          Delete ticket <strong>#{ticket.id} {ticket.title}</strong>? Its comments are deleted
          with it. This cannot be undone.
        </ConfirmDialog>
      )}
    </div>
  );
}
