import { memo, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useComments, createComment, commentsKey } from "../api/comments";
import { ApiError } from "../api/client";
import { formatUtc } from "../lib/dates";
import { TextArea, Button } from "./ui";

// §7: this panel is fully independent of the ticket form — posting appends to the
// comments cache only, never touches the ticket query, and the ticket's modifiedAt
// must not change. memo(): the parent form re-renders per keystroke; this panel's
// only prop is a stable primitive, so those renders skip the whole comment list.
function CommentsPanel({ ticketId }: { ticketId: number }) {
  const { data: comments, isPending, isError } = useComments(ticketId);
  const [body, setBody] = useState("");
  const queryClient = useQueryClient();

  const post = useMutation({
    mutationFn: () => createComment(ticketId, body),
    onSuccess: (created) => {
      setBody("");
      // The 201 response IS the new comment — append it instead of refetching the list.
      queryClient.setQueryData(commentsKey(ticketId), (old: unknown) =>
        Array.isArray(old) ? [...old, created] : [created]
      );
    },
  });

  const postError = post.error instanceof ApiError ? post.error : undefined;

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
          post.mutate(); // no client-side gate: the backend's field-level 400 renders below
        }}
      >
        <TextArea
          label="Add a comment"
          rows={3}
          value={body}
          onChange={(e) => setBody(e.target.value)}
          error={postError?.field === "body" ? postError.message : undefined}
        />
        {postError && postError.field !== "body" && (
          <p className="mb-2 text-sm text-red-600">{postError.message}</p>
        )}
        <Button pending={post.isPending} pendingLabel="Posting…">
          Post comment
        </Button>
      </form>
    </section>
  );
}

export default memo(CommentsPanel);
