import { useQuery } from "@tanstack/react-query";
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

export interface EpicWrite {
  title: string;
  description: string | null;
}

export const epicsKey = (teamId: number) => ["epics", teamId] as const;

export const listEpics = (teamId: number) => api<Epic[]>(`/epics?teamId=${teamId}`);
export const createEpic = (teamId: number, data: EpicWrite) =>
  api<Epic>("/epics", { method: "POST", body: JSON.stringify({ teamId, ...data }) });
export const updateEpic = (id: number, data: EpicWrite) =>
  api<Epic>(`/epics/${id}`, { method: "PATCH", body: JSON.stringify(data) });
export const deleteEpic = (id: number) => api<undefined>(`/epics/${id}`, { method: "DELETE" });

export function useEpics(teamId: number | null) {
  return useQuery({
    queryKey: teamId === null ? ["epics", "none"] : epicsKey(teamId),
    queryFn: () => listEpics(teamId!),
    enabled: teamId !== null,
  });
}
