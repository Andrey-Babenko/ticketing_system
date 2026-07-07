import { skipToken, useQuery } from "@tanstack/react-query";
import { api } from "./client";

export interface Epic {
  id: number;
  teamId: number;
  title: string;
  description: string | null;
  createdAt: string;
  modifiedAt: string;
  ticketCount: number;
}

// Raw form strings — the backend trims and normalizes empty description to null
// (one copy of the rule, review finding).
export interface EpicWrite {
  title: string;
  description: string;
}

export const epicsKey = (teamId: number | null) => ["epics", teamId] as const;

export const listEpics = (teamId: number) => api<Epic[]>(`/epics?teamId=${teamId}`);
export const createEpic = (teamId: number, data: EpicWrite) =>
  api<Epic>("/epics", { method: "POST", body: JSON.stringify({ teamId, ...data }) });
export const updateEpic = (id: number, data: EpicWrite) =>
  api<Epic>(`/epics/${id}`, { method: "PATCH", body: JSON.stringify(data) });
export const deleteEpic = (id: number) => api<undefined>(`/epics/${id}`, { method: "DELETE" });

export function useEpics(teamId: number | null) {
  return useQuery({
    queryKey: epicsKey(teamId),
    // skipToken: the built-in "no id yet" gate — no enabled flag, no undefined queryFn.
    queryFn: teamId === null ? skipToken : () => listEpics(teamId),
  });
}
