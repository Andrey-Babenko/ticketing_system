import { Router } from "express";
import { Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma.js";
import { isPrismaError } from "../lib/prismaErrors.js";
import { parsePositiveInt } from "../lib/ids.js";
import { ApiError } from "../middleware/errors.js";
import { validate } from "../middleware/validate.js";
import { commentCreateSchema, commentUpdateSchema } from "../validation/comments.js";

// mergeParams: the ticket id lives on the mount path (/api/tickets/:id/comments).
export const commentsRouter = Router({ mergeParams: true });

type CommentWithAuthor = Prisma.CommentGetPayload<{
  include: { author: { select: { id: true; email: true } } };
}>;

const AUTHOR = { author: { select: { id: true, email: true } } } as const;

function toDto(comment: CommentWithAuthor) {
  return {
    id: comment.id,
    ticketId: comment.ticketId,
    author: comment.author,
    body: comment.body,
    createdAt: comment.createdAt,
    editedAt: comment.editedAt,
  };
}

// The parent ticket must exist for both operations; its id comes from the mount path.
async function requireTicketId(raw: unknown): Promise<number> {
  const id = parsePositiveInt(raw);
  const ticket =
    id === null
      ? null
      : await prisma.ticket.findUnique({ where: { id }, select: { id: true } });
  if (!ticket) throw new ApiError(404, "NOT_FOUND", "Ticket not found");
  return ticket.id;
}

commentsRouter.get("/", async (req, res) => {
  const ticketId = await requireTicketId((req.params as { id?: string }).id);
  const comments = await prisma.comment.findMany({
    where: { ticketId },
    include: AUTHOR,
    orderBy: [{ createdAt: "asc" }, { id: "asc" }], // oldest first (§7), stable tiebreak
  });
  res.json(comments.map(toDto));
});

commentsRouter.post("/", validate(commentCreateSchema), async (req, res) => {
  const ticketId = await requireTicketId((req.params as { id?: string }).id);
  const { body } = req.body as { body: string };

  try {
    // §7: comments NEVER touch the Ticket row — no modifiedAt update here, ever.
    const comment = await prisma.comment.create({
      data: { ticketId, authorId: req.user!.id, body },
      include: AUTHOR,
    });
    res.status(201).json(toDto(comment));
  } catch (e) {
    // FK violation — race backstop: the ticket was deleted between check and create.
    if (isPrismaError(e, "P2003")) throw new ApiError(404, "NOT_FOUND", "Ticket not found");
    throw e;
  }
});

// S8.1: comment must belong to the ticket on the mount path, and the caller must be its
// author — no roles/admins exist (§12), so "own" is the only authorization rule.
async function requireOwnComment(ticketId: number, rawCommentId: unknown, userId: number) {
  const commentId = parsePositiveInt(rawCommentId);
  const comment =
    commentId === null ? null : await prisma.comment.findFirst({ where: { id: commentId, ticketId } });
  if (!comment) throw new ApiError(404, "NOT_FOUND", "Comment not found");
  if (comment.authorId !== userId) {
    throw new ApiError(403, "FORBIDDEN", "You can only edit or delete your own comments");
  }
  return comment;
}

commentsRouter.patch("/:commentId", validate(commentUpdateSchema), async (req, res) => {
  const ticketId = await requireTicketId((req.params as { id?: string }).id);
  const own = await requireOwnComment(
    ticketId,
    (req.params as { commentId?: string }).commentId,
    req.user!.id
  );
  const { body } = req.body as { body: string };

  // §7: editing NEVER touches the Ticket row — no modifiedAt update here, ever.
  const comment = await prisma.comment.update({
    where: { id: own.id },
    data: { body, editedAt: new Date() },
    include: AUTHOR,
  });
  res.json(toDto(comment));
});

commentsRouter.delete("/:commentId", async (req, res) => {
  const ticketId = await requireTicketId((req.params as { id?: string }).id);
  const own = await requireOwnComment(
    ticketId,
    (req.params as { commentId?: string }).commentId,
    req.user!.id
  );
  await prisma.comment.delete({ where: { id: own.id } });
  res.status(204).end();
});
