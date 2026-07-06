import { describe, it, expect } from "vitest";
import { Prisma } from "@prisma/client";
import { prisma } from "../src/lib/prisma.js";

async function mkUser(email: string) {
  return prisma.user.create({ data: { email, passwordHash: "x" } });
}

async function mkTeam(name: string) {
  return prisma.team.create({ data: { name } });
}

describe("schema — referential integrity and constraints (§9)", () => {
  it("fresh/truncated DB has zero rows in every table", async () => {
    expect(await prisma.user.count()).toBe(0);
    expect(await prisma.session.count()).toBe(0);
    expect(await prisma.team.count()).toBe(0);
    expect(await prisma.epic.count()).toBe(0);
    expect(await prisma.ticket.count()).toBe(0);
    expect(await prisma.comment.count()).toBe(0);
  });

  it("rejects deleting a team that still has an epic (§4)", async () => {
    const team = await mkTeam("Alpha");
    await prisma.epic.create({ data: { teamId: team.id, title: "E1" } });
    await expect(prisma.team.delete({ where: { id: team.id } })).rejects.toMatchObject({
      code: "P2003",
    });
  });

  it("rejects deleting a team that still has a ticket (§4)", async () => {
    const team = await mkTeam("Bravo");
    const user = await mkUser("bravo@example.com");
    await prisma.ticket.create({
      data: { teamId: team.id, type: "bug", title: "T1", body: "B1", createdById: user.id },
    });
    await expect(prisma.team.delete({ where: { id: team.id } })).rejects.toMatchObject({
      code: "P2003",
    });
  });

  it("rejects deleting an epic that still has a ticket referencing it (§5)", async () => {
    const team = await mkTeam("Charlie");
    const user = await mkUser("charlie@example.com");
    const epic = await prisma.epic.create({ data: { teamId: team.id, title: "E1" } });
    await prisma.ticket.create({
      data: {
        teamId: team.id,
        epicId: epic.id,
        type: "bug",
        title: "T1",
        body: "B1",
        createdById: user.id,
      },
    });
    await expect(prisma.epic.delete({ where: { id: epic.id } })).rejects.toMatchObject({
      code: "P2003",
    });
  });

  it("deleting a ticket cascades its comments (§6)", async () => {
    const team = await mkTeam("Delta");
    const user = await mkUser("delta@example.com");
    const ticket = await prisma.ticket.create({
      data: { teamId: team.id, type: "bug", title: "T1", body: "B1", createdById: user.id },
    });
    await prisma.comment.createMany({
      data: [
        { ticketId: ticket.id, authorId: user.id, body: "c1" },
        { ticketId: ticket.id, authorId: user.id, body: "c2" },
      ],
    });
    await prisma.ticket.delete({ where: { id: ticket.id } });
    expect(await prisma.comment.count({ where: { ticketId: ticket.id } })).toBe(0);
  });

  it("deleting a user cascades their sessions (ADR-8)", async () => {
    const user = await mkUser("echo@example.com");
    await prisma.session.create({
      data: { id: "sess1", userId: user.id, expiresAt: new Date(Date.now() + 86400000) },
    });
    await prisma.user.delete({ where: { id: user.id } });
    expect(await prisma.session.count()).toBe(0);
  });

  it("rejects deleting a user who created a ticket", async () => {
    const team = await mkTeam("Foxtrot");
    const user = await mkUser("foxtrot@example.com");
    await prisma.ticket.create({
      data: { teamId: team.id, type: "bug", title: "T1", body: "B1", createdById: user.id },
    });
    await expect(prisma.user.delete({ where: { id: user.id } })).rejects.toMatchObject({
      code: "P2003",
    });
  });

  it("enforces case-insensitive team-name uniqueness via the hand-added index (ADR-12)", async () => {
    await mkTeam("Golf");
    await expect(mkTeam("golf")).rejects.toThrow();
  });

  it("rejects an invalid ticket type at the client level", async () => {
    const team = await mkTeam("Hotel");
    const user = await mkUser("hotel@example.com");
    await expect(
      prisma.ticket.create({
        data: {
          teamId: team.id,
          type: "not-a-type" as Prisma.TicketCreateInput["type"],
          title: "T1",
          body: "B1",
          createdById: user.id,
        },
      })
    ).rejects.toThrow();
  });

  it("defaults ticket state to 'new' when omitted", async () => {
    const team = await mkTeam("India");
    const user = await mkUser("india@example.com");
    const ticket = await prisma.ticket.create({
      data: { teamId: team.id, type: "bug", title: "T1", body: "B1", createdById: user.id },
    });
    expect(ticket.state).toBe("new");
  });
});
