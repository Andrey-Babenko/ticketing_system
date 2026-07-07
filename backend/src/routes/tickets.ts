import { Router } from "express";
import { Prisma } from "@prisma/client";
import type { TicketType, TicketState } from "@prisma/client";
import { prisma } from "../lib/prisma.js";
import { isPrismaError } from "../lib/prismaErrors.js";
import { parsePositiveInt } from "../lib/ids.js";
import { ApiError } from "../middleware/errors.js";
import { validate } from "../middleware/validate.js";
import { ticketCreateSchema, ticketUpdateSchema } from "../validation/tickets.js";

export const ticketsRouter = Router();

type TicketWithCreator = Prisma.TicketGetPayload<{
  include: { createdBy: { select: { id: true; email: true } } };
}>;

const CREATOR = { createdBy: { select: { id: true, email: true } } } as const;

const notFound = () => new ApiError(404, "NOT_FOUND", "Ticket not found");
const epicTeamMismatch = () =>
  new ApiError(400, "EPIC_TEAM_MISMATCH", "The epic belongs to a different team", "epicId");

function toDto(ticket: TicketWithCreator) {
  return {
    id: ticket.id,
    teamId: ticket.teamId,
    epicId: ticket.epicId,
    type: ticket.type,
    state: ticket.state,
    title: ticket.title,
    body: ticket.body,
    createdAt: ticket.createdAt,
    modifiedAt: ticket.modifiedAt,
    createdBy: ticket.createdBy,
  };
}

// Contract idPath is a canonical positive integer; anything else can't exist → 404.
function parseId(raw: unknown): number {
  const id = parsePositiveInt(raw);
  if (id === null) throw notFound();
  return id;
}

async function assertTeamExists(teamId: number) {
  const team = await prisma.team.findUnique({ where: { id: teamId }, select: { id: true } });
  if (!team) throw new ApiError(400, "VALIDATION", "Team does not exist", "teamId");
}

// §6: a ticket's epic must be null or belong to the ticket's (merged) team.
async function assertEpicInTeam(epicId: number, teamId: number) {
  const epic = await prisma.epic.findUnique({
    where: { id: epicId },
    select: { teamId: true },
  });
  if (!epic) throw new ApiError(400, "VALIDATION", "Epic does not exist", "epicId");
  if (epic.teamId !== teamId) throw epicTeamMismatch();
}

// GET /api/tickets?teamId=X — malformed param → 400; well-formed but nonexistent → 404.
ticketsRouter.get("/", async (req, res) => {
  const raw = req.query.teamId;
  const teamId = parsePositiveInt(raw);
  if (teamId === null && !(typeof raw === "string" && /^[1-9][0-9]*$/.test(raw))) {
    throw new ApiError(400, "VALIDATION", "teamId must be a positive integer", "teamId");
  }

  const team =
    teamId === null
      ? null // well-formed but beyond INT4 — cannot exist
      : await prisma.team.findUnique({ where: { id: teamId }, select: { id: true } });
  if (!team) throw new ApiError(404, "NOT_FOUND", "Team not found");

  // Board order (§8): most recently modified first, id-desc tiebreak — done in the DB.
  const tickets = await prisma.ticket.findMany({
    where: { teamId: team.id },
    include: CREATOR,
    orderBy: [{ modifiedAt: "desc" }, { id: "desc" }],
  });
  res.json(tickets.map(toDto));
});

ticketsRouter.get("/:id", async (req, res) => {
  const id = parseId(req.params.id);
  const ticket = await prisma.ticket.findUnique({ where: { id }, include: CREATOR });
  if (!ticket) throw notFound();
  res.json(toDto(ticket));
});

ticketsRouter.post("/", validate(ticketCreateSchema), async (req, res) => {
  const { teamId, type, state, epicId, title, body } = req.body as {
    teamId: number;
    type: TicketType;
    state?: TicketState;
    epicId?: number | null;
    title: string;
    body: string;
  };

  await assertTeamExists(teamId);
  if (epicId != null) await assertEpicInTeam(epicId, teamId);

  try {
    const ticket = await prisma.ticket.create({
      data: {
        teamId,
        type,
        state: state ?? "new",
        epicId: epicId ?? null,
        title,
        body,
        createdById: req.user!.id,
      },
      include: CREATOR,
    });
    res.status(201).json(toDto(ticket));
  } catch (e) {
    // FK violation — race backstop: team or epic deleted between check and create.
    if (isPrismaError(e, "P2003")) {
      throw new ApiError(400, "VALIDATION", "Referenced team or epic does not exist");
    }
    throw e;
  }
});

// ADR-5: partial PATCH; the MERGED result (incoming ∪ stored) is what gets validated.
ticketsRouter.patch("/:id", validate(ticketUpdateSchema), async (req, res) => {
  const id = parseId(req.params.id);
  const body = req.body as {
    teamId?: number;
    type?: TicketType;
    state?: TicketState;
    epicId?: number | null;
    title?: string;
    body?: string;
  };

  const stored = await prisma.ticket.findUnique({ where: { id }, include: CREATOR });
  if (!stored) throw notFound();

  const merged = {
    teamId: body.teamId ?? stored.teamId,
    // null is a real value ("clear the epic") — only an ABSENT key means "keep".
    epicId: "epicId" in body ? (body.epicId ?? null) : stored.epicId,
    type: body.type ?? stored.type,
    state: body.state ?? stored.state,
    title: body.title ?? stored.title,
    body: body.body ?? stored.body,
  };

  // No-op saves must not advance modifiedAt (§6) — skip validation AND the write:
  // the stored state was validated when it was written.
  const isNoOp =
    merged.teamId === stored.teamId &&
    merged.epicId === stored.epicId &&
    merged.type === stored.type &&
    merged.state === stored.state &&
    merged.title === stored.title &&
    merged.body === stored.body;
  if (isNoOp) return res.json(toDto(stored));

  if (merged.teamId !== stored.teamId) await assertTeamExists(merged.teamId);
  // Re-prove the epic/team pair only when it changed — the stored pair is valid by
  // construction (epics cannot move teams), so an unchanged pair needs no round trip.
  if (
    merged.epicId !== null &&
    (merged.epicId !== stored.epicId || merged.teamId !== stored.teamId)
  ) {
    await assertEpicInTeam(merged.epicId, merged.teamId);
  }

  try {
    const ticket = await prisma.ticket.update({
      where: { id },
      data: { ...merged, modifiedAt: new Date() },
      include: CREATOR,
    });
    res.json(toDto(ticket));
  } catch (e) {
    // Row deleted between the existence check and the update — contract says 404.
    if (isPrismaError(e, "P2025")) throw notFound();
    // Team/epic deleted in the validation gap.
    if (isPrismaError(e, "P2003")) {
      throw new ApiError(400, "VALIDATION", "Referenced team or epic does not exist");
    }
    throw e;
  }
});

ticketsRouter.delete("/:id", async (req, res) => {
  const id = parseId(req.params.id);
  // No pre-existence check: tickets have no referenced-delete rule (unlike teams/epics,
  // whose pre-fetch drives the 409), so the P2025 catch alone covers the 404 path.
  try {
    await prisma.ticket.delete({ where: { id } }); // comments cascade via FK (§6)
  } catch (e) {
    if (isPrismaError(e, "P2025")) throw notFound();
    throw e;
  }
  res.status(204).end();
});
