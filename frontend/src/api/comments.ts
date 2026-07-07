import { useQuery } from "@tanstack/react-query";
import { api } from "./client";

export interface Comment {
  id: number;
  ticketId: number;
  author: { id: number; email: string };
  body: string;
  createdAt: string;
}

export const commentsKey = (ticketId: number) => ["comments", ticketId] as const;

export const listComments = (ticketId: number) =>
  api<Comment[]>(`/tickets/${ticketId}/comments`);
export const createComment = (ticketId: number, body: string) =>
  api<Comment>(`/tickets/${ticketId}/comments`, {
    method: "POST",
    body: JSON.stringify({ body }),
  });

export function useComments(ticketId: number) {
  return useQuery({
    queryKey: commentsKey(ticketId),
    queryFn: () => listComments(ticketId),
  });
}
