import { Router } from "express";
import { Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma.js";
import { isPrismaError } from "../lib/prismaErrors.js";
import { ApiError } from "../middleware/errors.js";
import { validate } from "../middleware/validate.js";
import { teamWriteSchema } from "../validation/teams.js";

export const teamsRouter = Router();

type TeamWithCounts = Prisma.TeamGetPayload<{
  include: { _count: { select: { tickets: true; epics: true } } };
}>;

const COUNTS = { _count: { select: { tickets: true, epics: true } } } as const;

const notFound = () => new ApiError(404, "NOT_FOUND", "Team not found");
const duplicateName = () =>
  new ApiError(409, "DUPLICATE_TEAM_NAME", "A team with this name already exists", "name");
const teamNotEmpty = () =>
  new ApiError(409, "TEAM_NOT_EMPTY", "This team cannot be deleted while it contains tickets or epics");

function toDto(team: TeamWithCounts) {
  return {
    id: team.id,
    name: team.name,
    createdAt: team.createdAt,
    modifiedAt: team.modifiedAt,
    ticketCount: team._count.tickets,
    epicCount: team._count.epics,
  };
}

// Contract idPath is a canonical positive integer; anything else can't exist → 404.
// Regex, not Number(): Number coerces '0x10'/'1e2'/' 5' to real ids (review finding).
// Express 5 types params as string | string[] (repeatable params) — hence unknown.
function parseId(raw: unknown): number {
  if (typeof raw !== "string" || !/^[1-9][0-9]*$/.test(raw)) throw notFound();
  return Number(raw);
}

async function assertNameFree(name: string, excludeId?: number) {
  const clash = await prisma.team.findFirst({
    where: {
      name: { equals: name, mode: "insensitive" },
      ...(excludeId !== undefined && { id: { not: excludeId } }),
    },
    select: { id: true },
  });
  if (clash) throw duplicateName();
}

teamsRouter.get("/", async (_req, res) => {
  const teams = await prisma.team.findMany({ include: COUNTS });
  // CI name-ascending; Prisma can't ORDER BY lower(name) and the list is small.
  teams.sort((a, b) => a.name.toLowerCase().localeCompare(b.name.toLowerCase()));
  res.json(teams.map(toDto));
});

teamsRouter.post("/", validate(teamWriteSchema), async (req, res) => {
  const { name } = req.body as { name: string };
  await assertNameFree(name);
  try {
    const team = await prisma.team.create({ data: { name }, include: COUNTS });
    res.status(201).json(toDto(team));
  } catch (e) {
    // team_name_ci unique index (ADR-12) — race backstop behind the pre-check.
    if (isPrismaError(e, "P2002")) throw duplicateName();
    throw e;
  }
});

teamsRouter.patch("/:id", validate(teamWriteSchema), async (req, res) => {
  const id = parseId(req.params.id);
  const { name } = req.body as { name: string };

  const existing = await prisma.team.findUnique({ where: { id }, include: COUNTS });
  if (!existing) throw notFound();

  // No-op saves must not advance modifiedAt (§6 rule, generalized) — skip the write entirely.
  if (existing.name === name) return res.json(toDto(existing));

  await assertNameFree(name, id);
  try {
    const team = await prisma.team.update({
      where: { id },
      data: { name, modifiedAt: new Date() },
      include: COUNTS,
    });
    res.json(toDto(team));
  } catch (e) {
    if (isPrismaError(e, "P2002")) throw duplicateName();
    // Row deleted between the existence check and the update — contract says 404, not 500.
    if (isPrismaError(e, "P2025")) throw notFound();
    throw e;
  }
});

teamsRouter.delete("/:id", async (req, res) => {
  const id = parseId(req.params.id);

  const existing = await prisma.team.findUnique({ where: { id }, include: COUNTS });
  if (!existing) throw notFound();
  if (existing._count.tickets > 0 || existing._count.epics > 0) throw teamNotEmpty();

  try {
    await prisma.team.delete({ where: { id } });
  } catch (e) {
    // FK Restrict (§4) — race backstop: a child was added between check and delete.
    if (isPrismaError(e, "P2003")) throw teamNotEmpty();
    if (isPrismaError(e, "P2025")) throw notFound();
    throw e;
  }
  res.status(204).end();
});
