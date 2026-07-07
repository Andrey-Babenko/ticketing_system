import { useState } from "react";
import { Link, useSearchParams } from "react-router";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useTeams } from "../api/teams";
import { useEpics, createEpic, updateEpic, deleteEpic, epicsKey } from "../api/epics";
import type { Epic } from "../api/epics";
import { ApiError } from "../api/client";
import { formatRelative } from "../lib/dates";
import { Button } from "../components/ui";
import ConfirmDialog from "../components/ConfirmDialog";
import EpicFormModal from "../components/EpicFormModal";
import type { EpicFormMode } from "../components/EpicFormModal";

type FormState = { mode: "closed" } | EpicFormMode;

export default function Epics() {
  const { data: teams, isPending: teamsPending } = useTeams();
  const [params, setParams] = useSearchParams();
  const queryClient = useQueryClient();

  // The screen is team-scoped (§5, wireframe 5); the selection lives in the URL.
  const paramTeamId = Number(params.get("team"));
  const selectedTeam =
    teams?.find((t) => t.id === paramTeamId) ?? teams?.[0] ?? null;
  const teamId = selectedTeam?.id ?? null;

  const { data: epics, isPending: epicsPending, isError } = useEpics(teamId);

  const [formState, setFormState] = useState<FormState>({ mode: "closed" });
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [deleting, setDeleting] = useState<Epic | null>(null);

  const invalidate = () =>
    teamId !== null && queryClient.invalidateQueries({ queryKey: epicsKey(teamId) });

  const closeForm = () => {
    setFormState({ mode: "closed" });
    setTitle("");
    setDescription("");
  };

  const save = useMutation({
    mutationFn: () => {
      const data = { title, description: description.trim() === "" ? null : description };
      return formState.mode === "edit"
        ? updateEpic(formState.epicId, data)
        : createEpic(teamId!, data);
    },
    onSuccess: () => {
      invalidate();
      closeForm();
    },
  });

  const remove = useMutation({
    mutationFn: (id: number) => deleteEpic(id),
    onSuccess: () => {
      invalidate();
      setDeleting(null);
    },
    onError: () => {
      // Stale count (a ticket got attached elsewhere): banner renders below + refetch.
      setDeleting(null);
      invalidate();
    },
  });

  const openCreate = () => {
    if (!selectedTeam) return;
    setFormState({ mode: "create", teamName: selectedTeam.name });
    setTitle("");
    setDescription("");
    save.reset();
  };

  const openEdit = (epic: Epic) => {
    setFormState({ mode: "edit", epicId: epic.id, originalTitle: epic.title });
    setTitle(epic.title);
    setDescription(epic.description ?? "");
    save.reset();
  };

  const openDelete = (epic: Epic) => {
    remove.reset();
    setDeleting(epic);
  };

  const saveError = save.error instanceof ApiError ? save.error : undefined;
  const removeError =
    remove.error instanceof ApiError ? remove.error.message : remove.isError ? "Delete failed" : null;

  if (teamsPending) {
    return <p className="py-8 text-center text-sm text-gray-500">Loading…</p>;
  }

  if (!teams || teams.length === 0) {
    return (
      <div className="mx-auto w-full max-w-3xl">
        <h1 className="mb-4 text-xl font-semibold text-gray-900">Epics</h1>
        <p className="rounded border border-dashed border-gray-300 py-8 text-center text-sm text-gray-500">
          No teams yet — epics belong to a team.{" "}
          <Link to="/teams" className="font-medium text-blue-700 hover:underline">
            Create a team first
          </Link>
          .
        </p>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-3xl">
      <div className="mb-4 flex items-start justify-between">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">Epics</h1>
          <label className="mt-1 flex items-center gap-2 text-sm text-gray-600">
            Team
            <select
              value={teamId ?? undefined}
              onChange={(e) => setParams({ team: e.target.value })}
              className="rounded border border-gray-300 px-2 py-1 text-sm"
            >
              {teams.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          </label>
        </div>
        <Button type="button" onClick={openCreate}>
          + Create epic
        </Button>
      </div>

      {removeError && (
        <p className="mb-3 rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {removeError}
        </p>
      )}

      {epicsPending ? (
        <p className="py-8 text-center text-sm text-gray-500">Loading epics…</p>
      ) : isError ? (
        <p className="py-8 text-center text-sm text-red-600">Could not load epics.</p>
      ) : epics.length === 0 ? (
        <p className="rounded border border-dashed border-gray-300 py-8 text-center text-sm text-gray-500">
          No epics in this team yet.
        </p>
      ) : (
        <>
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-gray-200 text-left text-xs uppercase tracking-wide text-gray-500">
                <th className="py-2 pr-4">Title</th>
                <th className="py-2 pr-4 text-right">Tickets</th>
                <th className="py-2 pr-4">Modified</th>
                <th className="py-2 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {epics.map((epic) => (
                <tr key={epic.id} className="border-b border-gray-100 align-top">
                  <td className="py-2 pr-4">
                    <span className="font-medium text-gray-900">{epic.title}</span>
                    {epic.description && (
                      <p className="mt-0.5 max-w-xs truncate text-xs text-gray-500">
                        {epic.description}
                      </p>
                    )}
                  </td>
                  <td className="py-2 pr-4 text-right tabular-nums">{epic.ticketCount}</td>
                  <td className="py-2 pr-4 text-gray-600">{formatRelative(epic.modifiedAt)}</td>
                  <td className="py-2 text-right">
                    <button
                      type="button"
                      onClick={() => openEdit(epic)}
                      className="mr-2 text-blue-700 hover:underline"
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      disabled={epic.ticketCount > 0}
                      title={
                        epic.ticketCount > 0
                          ? "Delete is disabled while tickets reference the epic"
                          : undefined
                      }
                      onClick={() => openDelete(epic)}
                      className="text-red-600 hover:underline disabled:cursor-not-allowed disabled:text-gray-300 disabled:no-underline"
                    >
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="mt-2 text-xs text-gray-400">
            Delete is disabled while tickets reference the epic.
          </p>
        </>
      )}

      <EpicFormModal
        open={formState.mode !== "closed"}
        mode={
          formState.mode === "closed"
            ? { mode: "create", teamName: selectedTeam?.name ?? "" }
            : formState
        }
        title={title}
        description={description}
        onTitleChange={setTitle}
        onDescriptionChange={setDescription}
        onSubmit={() => save.mutate()}
        onClose={closeForm}
        error={saveError?.message}
        pending={save.isPending}
      />

      <ConfirmDialog
        open={deleting !== null}
        title="Delete epic"
        pending={remove.isPending}
        onConfirm={() => deleting && remove.mutate(deleting.id)}
        onCancel={() => setDeleting(null)}
      >
        Delete epic <strong>{deleting?.title}</strong>? This cannot be undone.
      </ConfirmDialog>
    </div>
  );
}
