import { Router } from "express";
import { Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma.js";
import { isPrismaError } from "../lib/prismaErrors.js";
import { ApiError } from "../middleware/errors.js";
import { validate } from "../middleware/validate.js";
import { epicCreateSchema, epicUpdateSchema } from "../validation/epics.js";

export const epicsRouter = Router();

type EpicWithCount = Prisma.EpicGetPayload<{
  include: { _count: { select: { tickets: true } } };
}>;

const COUNT = { _count: { select: { tickets: true } } } as const;

const notFound = () => new ApiError(404, "NOT_FOUND", "Epic not found");
const epicReferenced = () =>
  new ApiError(409, "EPIC_REFERENCED", "This epic cannot be deleted while tickets reference it");

function toDto(epic: EpicWithCount) {
  return {
    id: epic.id,
    teamId: epic.teamId,
    title: epic.title,
    description: epic.description,
    createdAt: epic.createdAt,
    modifiedAt: epic.modifiedAt,
    ticketCount: epic._count.tickets,
  };
}

// Contract idPath is a canonical positive integer; anything else can't exist → 404.
function parseId(raw: unknown): number {
  if (typeof raw !== "string" || !/^[1-9][0-9]*$/.test(raw)) throw notFound();
  return Number(raw);
}

// GET /api/epics?teamId=X — missing/invalid param → 400, unknown team → 404 (openapi).
epicsRouter.get("/", async (req, res) => {
  const raw = req.query.teamId;
  if (typeof raw !== "string" || !/^[1-9][0-9]*$/.test(raw)) {
    throw new ApiError(400, "VALIDATION", "teamId must be a positive integer", "teamId");
  }
  const teamId = Number(raw);

  const team = await prisma.team.findUnique({ where: { id: teamId }, select: { id: true } });
  if (!team) throw new ApiError(404, "NOT_FOUND", "Team not found");

  const epics = await prisma.epic.findMany({ where: { teamId }, include: COUNT });
  // CI title-ascending (contract); Prisma can't ORDER BY lower(title), list is small.
  epics.sort((a, b) => a.title.toLowerCase().localeCompare(b.title.toLowerCase()));
  res.json(epics.map(toDto));
});

epicsRouter.post("/", validate(epicCreateSchema), async (req, res) => {
  const { teamId, title, description } = req.body as {
    teamId: number;
    title: string;
    description?: string | null;
  };

  // Dangling reference is a body-validation failure per the contract → 400 (not 404).
  const team = await prisma.team.findUnique({ where: { id: teamId }, select: { id: true } });
  if (!team) throw new ApiError(400, "VALIDATION", "Team does not exist", "teamId");

  const epic = await prisma.epic.create({
    data: { teamId, title, description: description ?? null },
    include: COUNT,
  });
  res.status(201).json(toDto(epic));
});

epicsRouter.patch("/:id", validate(epicUpdateSchema), async (req, res) => {
  const id = parseId(req.params.id);
  const { title, description } = req.body as { title?: string; description?: string | null };

  const existing = await prisma.epic.findUnique({ where: { id }, include: COUNT });
  if (!existing) throw notFound();

  // Merge PATCH semantics: absent field = keep stored value (undefined ≠ null here).
  const mergedTitle = title ?? existing.title;
  const mergedDescription = description === undefined ? existing.description : description;

  // No-op saves must not advance modifiedAt (§6 rule, generalized) — skip the write entirely.
  if (mergedTitle === existing.title && mergedDescription === existing.description) {
    return res.json(toDto(existing));
  }

  try {
    const epic = await prisma.epic.update({
      where: { id },
      data: { title: mergedTitle, description: mergedDescription, modifiedAt: new Date() },
      include: COUNT,
    });
    res.json(toDto(epic));
  } catch (e) {
    // Row deleted between the existence check and the update — contract says 404, not 500.
    if (isPrismaError(e, "P2025")) throw notFound();
    throw e;
  }
});

epicsRouter.delete("/:id", async (req, res) => {
  const id = parseId(req.params.id);

  const existing = await prisma.epic.findUnique({ where: { id }, include: COUNT });
  if (!existing) throw notFound();
  if (existing._count.tickets > 0) throw epicReferenced();

  try {
    await prisma.epic.delete({ where: { id } });
  } catch (e) {
    // FK Restrict (§5) — race backstop: a ticket was attached between check and delete.
    if (isPrismaError(e, "P2003")) throw epicReferenced();
    if (isPrismaError(e, "P2025")) throw notFound();
    throw e;
  }
  res.status(204).end();
});
