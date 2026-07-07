import { useQuery } from "@tanstack/react-query";
import { api } from "./client";

export interface Team {
  id: number;
  name: string;
  createdAt: string;
  modifiedAt: string;
  ticketCount: number;
  epicCount: number;
}

export const teamsKey = ["teams"] as const;

export const listTeams = () => api<Team[]>("/teams");
export const createTeam = (name: string) =>
  api<Team>("/teams", { method: "POST", body: JSON.stringify({ name }) });
export const renameTeam = (id: number, name: string) =>
  api<Team>(`/teams/${id}`, { method: "PATCH", body: JSON.stringify({ name }) });
export const deleteTeam = (id: number) =>
  api<undefined>(`/teams/${id}`, { method: "DELETE" });

export function useTeams() {
  return useQuery({ queryKey: teamsKey, queryFn: listTeams });
}
