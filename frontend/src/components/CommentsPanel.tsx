import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useComments, createComment, commentsKey } from "../api/comments";
import { ApiError } from "../api/client";
import { formatUtc } from "../lib/dates";
import { Button } from "./ui";

// §7: this panel is fully independent of the ticket form — posting invalidates ONLY the
// comments list, never the ticket query, and the ticket's modifiedAt must not change.
export default function CommentsPanel({ ticketId }: { ticketId: number }) {
  const { data: comments, isPending, isError } = useComments(ticketId);
  const [body, setBody] = useState("");
  const queryClient = useQueryClient();

  const post = useMutation({
    mutationFn: () => createComment(ticketId, body),
    onSuccess: () => {
      setBody("");
      queryClient.invalidateQueries({ queryKey: commentsKey(ticketId) });
    },
  });

  const error =
    post.error instanceof ApiError ? post.error.message : post.isError ? "Post failed" : null;

  return (
    <section className="rounded border border-gray-200 bg-gray-50 p-4">
      <h2 className="mb-3 text-sm font-semibold text-gray-800">
        Comments{comments && ` (${comments.length})`}
      </h2>

      {isPending ? (
        <p className="text-sm text-gray-500">Loading comments…</p>
      ) : isError ? (
        <p className="text-sm text-red-600">Could not load comments.</p>
      ) : comments.length === 0 ? (
        <p className="text-sm text-gray-500">No comments yet.</p>
      ) : (
        <ul className="mb-3 space-y-3">
          {comments.map((c) => (
            <li key={c.id} className="rounded border border-gray-200 bg-white p-3">
              <p className="mb-1 text-xs text-gray-500">
                <span className="font-medium text-gray-700">{c.author.email}</span>
                {" · "}
                {formatUtc(c.createdAt)}
              </p>
              <p className="whitespace-pre-wrap text-sm text-gray-800">{c.body}</p>
            </li>
          ))}
        </ul>
      )}

      <form
        className="mt-3"
        onSubmit={(e) => {
          e.preventDefault();
          if (body.trim() === "") return;
          post.mutate();
        }}
      >
        <textarea
          rows={3}
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder="Add a comment…"
          className="mb-2 w-full rounded border border-gray-300 px-3 py-2 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
        />
        {error && <p className="mb-2 text-sm text-red-600">{error}</p>}
        <Button pending={post.isPending} pendingLabel="Posting…">
          Post comment
        </Button>
      </form>
    </section>
  );
}
