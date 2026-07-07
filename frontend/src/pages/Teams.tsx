import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useTeams, createTeam, renameTeam, deleteTeam, teamsKey } from "../api/teams";
import type { Team } from "../api/teams";
import { ApiError } from "../api/client";
import { formatRelative } from "../lib/dates";
import { Button } from "../components/ui";
import ConfirmDialog from "../components/ConfirmDialog";
import TeamFormModal from "../components/TeamFormModal";
import type { TeamFormMode } from "../components/TeamFormModal";

type FormState = { mode: "closed" } | TeamFormMode;

export default function Teams() {
  const { data: teams, isPending, isError } = useTeams();
  const queryClient = useQueryClient();

  const [formState, setFormState] = useState<FormState>({ mode: "closed" });
  const [name, setName] = useState("");
  const [deleting, setDeleting] = useState<Team | null>(null);

  const invalidate = () => queryClient.invalidateQueries({ queryKey: teamsKey });

  const closeForm = () => {
    setFormState({ mode: "closed" });
    setName("");
  };

  const save = useMutation({
    mutationFn: () =>
      formState.mode === "edit" ? renameTeam(formState.teamId, name) : createTeam(name),
    onSuccess: () => {
      invalidate();
      closeForm();
    },
  });

  const remove = useMutation({
    mutationFn: (id: number) => deleteTeam(id),
    onSuccess: (_data, id) => {
      invalidate();
      setDeleting(null);
      // The deleted team may be the one loaded in the edit modal — don't leave a ghost.
      if (formState.mode === "edit" && formState.teamId === id) closeForm();
    },
    onError: () => {
      // Stale counts (another tab added a ticket/epic): banner renders remove.error below.
      setDeleting(null);
      invalidate();
    },
  });

  const openCreate = () => {
    setFormState({ mode: "create" });
    setName("");
    save.reset();
  };

  const openEdit = (team: Team) => {
    setFormState({ mode: "edit", teamId: team.id, originalName: team.name });
    setName(team.name);
    save.reset();
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
        <Button type="button" onClick={openCreate}>
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
          No teams yet — create the first one above.
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
                        onClick={() => openEdit(team)}
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

      <TeamFormModal
        open={formState.mode !== "closed"}
        mode={formState.mode === "closed" ? { mode: "create" } : formState}
        name={name}
        onNameChange={setName}
        onSubmit={() => save.mutate()}
        onClose={closeForm}
        error={saveError?.message}
        pending={save.isPending}
      />

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
