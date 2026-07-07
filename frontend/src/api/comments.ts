import { useQuery } from "@tanstack/react-query";
import { api } from "./client";

export interface Comment {
  id: number;
  ticketId: number;
  author: { id: number; email: string };
  body: string;
  createdAt: string;
  editedAt: string | null;
}

export const commentsKey = (ticketId: number) => ["comments", ticketId] as const;

export const listComments = (ticketId: number) =>
  api<Comment[]>(`/tickets/${ticketId}/comments`);
export const createComment = (ticketId: number, body: string) =>
  api<Comment>(`/tickets/${ticketId}/comments`, {
    method: "POST",
    body: JSON.stringify({ body }),
  });
export const updateComment = (ticketId: number, commentId: number, body: string) =>
  api<Comment>(`/tickets/${ticketId}/comments/${commentId}`, {
    method: "PATCH",
    body: JSON.stringify({ body }),
  });
export const deleteComment = (ticketId: number, commentId: number) =>
  api<undefined>(`/tickets/${ticketId}/comments/${commentId}`, { method: "DELETE" }); // 204

export function useComments(ticketId: number) {
  return useQuery({
    queryKey: commentsKey(ticketId),
    queryFn: () => listComments(ticketId),
  });
}
