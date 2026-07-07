import { useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useTeams, createTeam, renameTeam, deleteTeam, teamsKey } from "../api/teams";
import type { Team } from "../api/teams";
import { ApiError } from "../api/client";
import { formatRelative } from "../lib/dates";
import { Field, Button } from "../components/ui";
import ConfirmDialog from "../components/ConfirmDialog";

// Interview decision: the bottom form serves both create and edit (Edit populates it).
type FormMode = { mode: "create" } | { mode: "edit"; teamId: number; originalName: string };

export default function Teams() {
  const { data: teams, isPending, isError } = useTeams();
  const queryClient = useQueryClient();

  const [formMode, setFormMode] = useState<FormMode>({ mode: "create" });
  const [name, setName] = useState("");
  const [deleting, setDeleting] = useState<Team | null>(null);
  const nameInput = useRef<HTMLInputElement>(null);

  const invalidate = () => queryClient.invalidateQueries({ queryKey: teamsKey });

  const resetForm = () => {
    setFormMode({ mode: "create" });
    setName("");
  };

  const save = useMutation({
    mutationFn: () =>
      formMode.mode === "edit" ? renameTeam(formMode.teamId, name) : createTeam(name),
    onSuccess: () => {
      invalidate();
      resetForm();
    },
  });

  const remove = useMutation({
    mutationFn: (id: number) => deleteTeam(id),
    onSuccess: (_data, id) => {
      invalidate();
      setDeleting(null);
      // The deleted team may be the one loaded in the edit form — don't leave a ghost.
      if (formMode.mode === "edit" && formMode.teamId === id) resetForm();
    },
    onError: () => {
      // Stale counts (another tab added a ticket/epic): banner renders remove.error below.
      setDeleting(null);
      invalidate();
    },
  });

  const startEdit = (team: Team) => {
    setFormMode({ mode: "edit", teamId: team.id, originalName: team.name });
    setName(team.name);
    save.reset();
    nameInput.current?.focus();
  };

  const focusCreate = () => {
    resetForm();
    save.reset();
    nameInput.current?.focus();
  };

  const openDelete = (team: Team) => {
    remove.reset(); // clear a previous failure's banner when starting a new attempt
    setDeleting(team);
  };

  const saveError = save.error instanceof ApiError ? save.error : undefined;
  const removeError =
    remove.error instanceof ApiError ? remove.error.message : remove.isError ? "Delete failed" : null;

  return (
    <div className="mx-auto w-full max-w-3xl">
      <div className="mb-4 flex items-start justify-between">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">Teams</h1>
          <p className="text-sm text-gray-500">All verified users can view and manage all teams</p>
        </div>
        <Button type="button" onClick={focusCreate}>
          + Create team
        </Button>
      </div>

      {removeError && (
        <p className="mb-3 rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {removeError}
        </p>
      )}

      {isPending ? (
        <p className="py-8 text-center text-sm text-gray-500">Loading teams…</p>
      ) : isError ? (
        <p className="py-8 text-center text-sm text-red-600">Could not load teams.</p>
      ) : teams.length === 0 ? (
        <p className="rounded border border-dashed border-gray-300 py-8 text-center text-sm text-gray-500">
          No teams yet — create the first one below.
        </p>
      ) : (
        <>
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-gray-200 text-left text-xs uppercase tracking-wide text-gray-500">
                <th className="py-2 pr-4">Name</th>
                <th className="py-2 pr-4 text-right">Tickets</th>
                <th className="py-2 pr-4 text-right">Epics</th>
                <th className="py-2 pr-4">Modified</th>
                <th className="py-2 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {teams.map((team) => {
                const busy = team.ticketCount > 0 || team.epicCount > 0;
                return (
                  <tr key={team.id} className="border-b border-gray-100">
                    <td className="py-2 pr-4 font-medium text-gray-900">{team.name}</td>
                    <td className="py-2 pr-4 text-right tabular-nums">{team.ticketCount}</td>
                    <td className="py-2 pr-4 text-right tabular-nums">{team.epicCount}</td>
                    <td className="py-2 pr-4 text-gray-600">{formatRelative(team.modifiedAt)}</td>
                    <td className="py-2 text-right">
                      <button
                        type="button"
                        onClick={() => startEdit(team)}
                        className="mr-2 text-blue-700 hover:underline"
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        disabled={busy}
                        title={busy ? "Delete is disabled while a team contains tickets or epics" : undefined}
                        onClick={() => openDelete(team)}
                        className="text-red-600 hover:underline disabled:cursor-not-allowed disabled:text-gray-300 disabled:no-underline"
                      >
                        Delete
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <p className="mt-2 text-xs text-gray-400">
            Delete is disabled while a team contains tickets or epics.
          </p>
        </>
      )}

      <form
        className="mt-6 max-w-md rounded border border-gray-200 bg-gray-50 p-4"
        onSubmit={(e) => {
          e.preventDefault();
          save.mutate();
        }}
      >
        <h2 className="mb-2 text-sm font-semibold text-gray-800">
          {formMode.mode === "edit" ? `Rename team “${formMode.originalName}”` : "Create team"}
        </h2>
        <Field
          label="Team name"
          ref={nameInput}
          required
          value={name}
          onChange={(e) => setName(e.target.value)}
          error={saveError?.message}
        />
        <div className="mt-1 flex gap-2">
          <Button pending={save.isPending} pendingLabel="Saving…">
            {formMode.mode === "edit" ? "Save" : "Create"}
          </Button>
          {formMode.mode === "edit" && (
            <Button
              type="button"
              variant="secondary"
              onClick={() => {
                resetForm();
                save.reset();
              }}
            >
              Cancel
            </Button>
          )}
        </div>
      </form>

      <ConfirmDialog
        open={deleting !== null}
        title="Delete team"
        pending={remove.isPending}
        onConfirm={() => deleting && remove.mutate(deleting.id)}
        onCancel={() => setDeleting(null)}
      >
        Delete team <strong>{deleting?.name}</strong>? This cannot be undone.
      </ConfirmDialog>
    </div>
  );
}
