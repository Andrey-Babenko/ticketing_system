import { memo, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  useComments,
  createComment,
  updateComment,
  deleteComment,
  commentsKey,
} from "../api/comments";
import type { Comment } from "../api/comments";
import { useMe } from "../api/auth";
import { ApiError } from "../api/client";
import { formatUtc } from "../lib/dates";
import { TextArea, Button } from "./ui";
import ConfirmDialog from "./ConfirmDialog";

// §7: this panel is fully independent of the ticket form — posting appends to the
// comments cache only, never touches the ticket query, and the ticket's modifiedAt
// must not change. memo(): the parent form re-renders per keystroke; this panel's
// only prop is a stable primitive, so those renders skip the whole comment list.
function CommentsPanel({ ticketId }: { ticketId: number }) {
  const { data: comments, isPending, isError } = useComments(ticketId);
  const { data: me } = useMe();
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
            <CommentItem key={c.id} ticketId={ticketId} comment={c} isOwn={c.author.id === me?.id} />
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

// S8.1: own-comment edit/delete. Controls only render for the author (checked against
// useMe()); the backend's 403 is the real guard, this is just UI tidiness.
function CommentItem({
  ticketId,
  comment,
  isOwn,
}: {
  ticketId: number;
  comment: Comment;
  isOwn: boolean;
}) {
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(comment.body);
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  const edit = useMutation({
    mutationFn: (nextBody: string) => updateComment(ticketId, comment.id, nextBody),
    onSuccess: (updated) => {
      setEditing(false);
      queryClient.setQueryData(commentsKey(ticketId), (old: unknown) =>
        Array.isArray(old) ? old.map((c: Comment) => (c.id === updated.id ? updated : c)) : old
      );
    },
  });

  const remove = useMutation({
    mutationFn: () => deleteComment(ticketId, comment.id),
    onSuccess: () => {
      queryClient.setQueryData(commentsKey(ticketId), (old: unknown) =>
        Array.isArray(old) ? old.filter((c: Comment) => c.id !== comment.id) : old
      );
    },
    onError: () => setConfirmingDelete(false),
  });

  const editError = edit.error instanceof ApiError ? edit.error : undefined;
  const removeError = remove.error instanceof ApiError ? remove.error.message : undefined;

  return (
    <li className="rounded border border-gray-200 bg-white p-3">
      <div className="mb-1 flex items-start justify-between gap-2 text-xs text-gray-500">
        <p>
          <span className="font-medium text-gray-700">{comment.author.email}</span>
          {" · "}
          {formatUtc(comment.createdAt)}
          {comment.editedAt && (
            <span title={`Edited ${formatUtc(comment.editedAt)}`}> · (edited)</span>
          )}
        </p>
        {isOwn && !editing && (
          <span className="flex shrink-0 gap-2">
            <button
              type="button"
              className="font-medium text-blue-700 hover:underline"
              onClick={() => {
                setDraft(comment.body);
                setEditing(true);
              }}
            >
              Edit
            </button>
            <button
              type="button"
              className="font-medium text-red-600 hover:underline"
              onClick={() => setConfirmingDelete(true)}
            >
              Delete
            </button>
          </span>
        )}
      </div>

      {editing ? (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            edit.mutate(draft);
          }}
        >
          <TextArea
            label="Edit comment"
            rows={3}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            error={editError?.field === "body" ? editError.message : undefined}
          />
          {editError && editError.field !== "body" && (
            <p className="mb-2 text-sm text-red-600">{editError.message}</p>
          )}
          <div className="flex gap-2">
            <Button pending={edit.isPending} pendingLabel="Saving…">
              Save
            </Button>
            <Button
              type="button"
              variant="secondary"
              disabled={edit.isPending}
              onClick={() => setEditing(false)}
            >
              Cancel
            </Button>
          </div>
        </form>
      ) : (
        <p className="whitespace-pre-wrap text-sm text-gray-800">{comment.body}</p>
      )}

      {removeError && <p className="mt-2 text-sm text-red-600">{removeError}</p>}

      <ConfirmDialog
        open={confirmingDelete}
        title="Delete comment"
        pending={remove.isPending}
        onConfirm={() => remove.mutate()}
        onCancel={() => setConfirmingDelete(false)}
      >
        Delete this comment? This cannot be undone.
      </ConfirmDialog>
    </li>
  );
}

export default memo(CommentsPanel);
