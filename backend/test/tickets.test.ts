import { describe, it, expect, beforeEach } from "vitest";
import request from "supertest";
import { app } from "../src/app.js";
import { prisma } from "../src/lib/prisma.js";
import { authedCookie } from "./helpers.js";

const ISO_UTC = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;

async function mkTeam(name: string) {
  return prisma.team.create({ data: { name } });
}

async function mkEpic(teamId: number, title: string) {
  return prisma.epic.create({ data: { teamId, title } });
}

describe("tickets API (S5.1, §6)", () => {
  let cookie: string;
  let teamId: number;
  let userId: number;

  beforeEach(async () => {
    cookie = await authedCookie();
    userId = (await prisma.user.findFirstOrThrow()).id;
    teamId = (await mkTeam("Payments")).id;
  });

  const validBody = () => ({ teamId, type: "bug", title: "T", body: "B" });

  async function mkTicket(overrides: Record<string, unknown> = {}) {
    const res = await request(app)
      .post("/api/tickets")
      .set("Cookie", cookie)
      .send({ ...validBody(), ...overrides });
    expect(res.status).toBe(201);
    return res.body;
  }

  it("requires authentication on every operation", async () => {
    expect((await request(app).get(`/api/tickets?teamId=${teamId}`)).status).toBe(401);
    expect((await request(app).post("/api/tickets").send(validBody())).status).toBe(401);
    expect((await request(app).get("/api/tickets/1")).status).toBe(401);
    expect((await request(app).patch("/api/tickets/1").send({ state: "done" })).status).toBe(401);
    expect((await request(app).delete("/api/tickets/1")).status).toBe(401);
  });

  describe("GET /api/tickets", () => {
    it("rejects a missing or malformed teamId with 400", async () => {
      expect((await request(app).get("/api/tickets").set("Cookie", cookie)).status).toBe(400);
      expect(
        (await request(app).get("/api/tickets?teamId=abc").set("Cookie", cookie)).status
      ).toBe(400);
    });

    it("returns 404 for an unknown or beyond-INT4 team", async () => {
      expect(
        (await request(app).get("/api/tickets?teamId=9999").set("Cookie", cookie)).status
      ).toBe(404);
      expect(
        (await request(app).get("/api/tickets?teamId=2147483648").set("Cookie", cookie)).status
      ).toBe(404);
    });

    it("returns [] for a team with no tickets", async () => {
      const res = await request(app).get(`/api/tickets?teamId=${teamId}`).set("Cookie", cookie);
      expect(res.status).toBe(200);
      expect(res.body).toEqual([]);
    });

    it("returns only the team's tickets, modifiedAt desc with id-desc tiebreak", async () => {
      const other = await mkTeam("Elsewhere");
      const pinned = new Date("2026-01-01T00:00:00.000Z");
      // Direct inserts with pinned equal modifiedAt to exercise the tiebreak deterministically.
      const a = await prisma.ticket.create({
        data: { teamId, type: "bug", title: "A", body: "b", createdById: userId, modifiedAt: pinned },
      });
      const b = await prisma.ticket.create({
        data: { teamId, type: "bug", title: "B", body: "b", createdById: userId, modifiedAt: pinned },
      });
      const newer = await prisma.ticket.create({
        data: {
          teamId, type: "bug", title: "C", body: "b", createdById: userId,
          modifiedAt: new Date("2026-01-02T00:00:00.000Z"),
        },
      });
      await prisma.ticket.create({
        data: { teamId: other.id, type: "bug", title: "X", body: "b", createdById: userId },
      });

      const res = await request(app).get(`/api/tickets?teamId=${teamId}`).set("Cookie", cookie);
      expect(res.body.map((t: { id: number }) => t.id)).toEqual([newer.id, b.id, a.id]);
    });
  });

  describe("POST /api/tickets", () => {
    it("creates with the exact contract DTO; state defaults to new; modifiedAt equals createdAt", async () => {
      const res = await request(app)
        .post("/api/tickets")
        .set("Cookie", cookie)
        .send({ teamId, type: "feature", title: "  Pay button  ", body: "  Details  " });
      expect(res.status).toBe(201);
      expect(Object.keys(res.body).sort()).toEqual([
        "body", "createdAt", "createdBy", "epicId", "id", "modifiedAt", "state", "teamId", "title", "type",
      ]);
      expect(res.body).toMatchObject({
        teamId,
        epicId: null,
        type: "feature",
        state: "new",
        title: "Pay button",
        body: "Details",
      });
      expect(res.body.createdBy).toEqual({ id: userId, email: "tester@example.com" });
      expect(res.body.createdAt).toMatch(ISO_UTC);
      expect(res.body.modifiedAt).toBe(res.body.createdAt);
    });

    it("accepts any of the five states on create (§8 — no transition rules)", async () => {
      const res = await mkTicket({ state: "done" });
      expect(res.state).toBe("done");
    });

    it("rejects whitespace-only title and body with field-level 400s", async () => {
      const t = await request(app)
        .post("/api/tickets").set("Cookie", cookie)
        .send({ ...validBody(), title: "   " });
      expect(t.status).toBe(400);
      expect(t.body.error.field).toBe("title");

      const b = await request(app)
        .post("/api/tickets").set("Cookie", cookie)
        .send({ ...validBody(), body: "   " });
      expect(b.status).toBe(400);
      expect(b.body.error.field).toBe("body");
    });

    it("rejects invalid enum values (§6 canonical values only)", async () => {
      expect(
        (await request(app).post("/api/tickets").set("Cookie", cookie)
          .send({ ...validBody(), type: "epic" })).status
      ).toBe(400);
      expect(
        (await request(app).post("/api/tickets").set("Cookie", cookie)
          .send({ ...validBody(), state: "in progress" })).status
      ).toBe(400);
    });

    it("rejects a dangling teamId with 400", async () => {
      const res = await request(app)
        .post("/api/tickets").set("Cookie", cookie)
        .send({ ...validBody(), teamId: 9999 });
      expect(res.status).toBe(400);
    });

    it("rejects an epic from another team with EPIC_TEAM_MISMATCH (§6)", async () => {
      const other = await mkTeam("Other");
      const foreignEpic = await mkEpic(other.id, "Foreign");
      const res = await request(app)
        .post("/api/tickets").set("Cookie", cookie)
        .send({ ...validBody(), epicId: foreignEpic.id });
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe("EPIC_TEAM_MISMATCH");
    });

    it("rejects a dangling epicId with 400 and accepts an explicit null", async () => {
      expect(
        (await request(app).post("/api/tickets").set("Cookie", cookie)
          .send({ ...validBody(), epicId: 9999 })).status
      ).toBe(400);
      const ok = await mkTicket({ epicId: null });
      expect(ok.epicId).toBeNull();
    });

    it("accepts a same-team epic", async () => {
      const epic = await mkEpic(teamId, "Home");
      const res = await mkTicket({ epicId: epic.id });
      expect(res.epicId).toBe(epic.id);
    });

    it("rejects unknown keys with 400 (strict schema convention)", async () => {
      const res = await request(app)
        .post("/api/tickets").set("Cookie", cookie)
        .send({ ...validBody(), epicID: 1 });
      expect(res.status).toBe(400);
    });
  });

  describe("PATCH /api/tickets/:id (merged-state validation, ADR-5)", () => {
    it("a {state}-only drag payload works and bumps modifiedAt", async () => {
      const ticket = await mkTicket();
      await new Promise((r) => setTimeout(r, 5));
      const res = await request(app)
        .patch(`/api/tickets/${ticket.id}`).set("Cookie", cookie)
        .send({ state: "in_progress" });
      expect(res.status).toBe(200);
      expect(res.body.state).toBe("in_progress");
      expect(new Date(res.body.modifiedAt).getTime()).toBeGreaterThan(
        new Date(ticket.modifiedAt).getTime()
      );
    });

    it("no-op PATCH with all current values leaves modifiedAt byte-identical (§6)", async () => {
      const epic = await mkEpic(teamId, "E");
      const ticket = await mkTicket({ epicId: epic.id });
      const res = await request(app)
        .patch(`/api/tickets/${ticket.id}`).set("Cookie", cookie)
        .send({
          teamId, epicId: epic.id, type: ticket.type, state: ticket.state,
          title: ticket.title, body: ticket.body,
        });
      expect(res.status).toBe(200);
      expect(res.body.modifiedAt).toBe(ticket.modifiedAt);
    });

    it("no-op {state: current} leaves modifiedAt byte-identical", async () => {
      const ticket = await mkTicket();
      const res = await request(app)
        .patch(`/api/tickets/${ticket.id}`).set("Cookie", cookie)
        .send({ state: "new" });
      expect(res.body.modifiedAt).toBe(ticket.modifiedAt);
    });

    it("team change keeping a now-foreign epic → 400 EPIC_TEAM_MISMATCH", async () => {
      const epic = await mkEpic(teamId, "Anchored");
      const ticket = await mkTicket({ epicId: epic.id });
      const other = await mkTeam("Target");
      const res = await request(app)
        .patch(`/api/tickets/${ticket.id}`).set("Cookie", cookie)
        .send({ teamId: other.id });
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe("EPIC_TEAM_MISMATCH");
      const unchanged = await prisma.ticket.findUnique({ where: { id: ticket.id } });
      expect(unchanged!.teamId).toBe(teamId);
    });

    it("team change with epicId: null in the same PATCH succeeds (§6 clear-or-replace)", async () => {
      const epic = await mkEpic(teamId, "Cleared");
      const ticket = await mkTicket({ epicId: epic.id });
      const other = await mkTeam("Target");
      const res = await request(app)
        .patch(`/api/tickets/${ticket.id}`).set("Cookie", cookie)
        .send({ teamId: other.id, epicId: null });
      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({ teamId: other.id, epicId: null });
    });

    it("team change with a matching new-team epic succeeds (§6 replace)", async () => {
      const ticket = await mkTicket();
      const other = await mkTeam("Target");
      const targetEpic = await mkEpic(other.id, "Landing");
      const res = await request(app)
        .patch(`/api/tickets/${ticket.id}`).set("Cookie", cookie)
        .send({ teamId: other.id, epicId: targetEpic.id });
      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({ teamId: other.id, epicId: targetEpic.id });
    });

    it("epic change to another team's epic (team unchanged) → 400 EPIC_TEAM_MISMATCH", async () => {
      const ticket = await mkTicket();
      const other = await mkTeam("Other");
      const foreignEpic = await mkEpic(other.id, "Foreign");
      const res = await request(app)
        .patch(`/api/tickets/${ticket.id}`).set("Cookie", cookie)
        .send({ epicId: foreignEpic.id });
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe("EPIC_TEAM_MISMATCH");
    });

    it("rejects invalid enums and unknown keys on PATCH", async () => {
      const ticket = await mkTicket();
      expect(
        (await request(app).patch(`/api/tickets/${ticket.id}`).set("Cookie", cookie)
          .send({ state: "shipped" })).status
      ).toBe(400);
      expect(
        (await request(app).patch(`/api/tickets/${ticket.id}`).set("Cookie", cookie)
          .send({ epicID: null })).status
      ).toBe(400);
    });

    it("returns 404 for unknown and beyond-INT4 ids", async () => {
      expect(
        (await request(app).patch("/api/tickets/9999").set("Cookie", cookie)
          .send({ state: "done" })).status
      ).toBe(404);
      expect(
        (await request(app).patch("/api/tickets/2147483648").set("Cookie", cookie)
          .send({ state: "done" })).status
      ).toBe(404);
    });

    it("rejects a dangling merged teamId with 400", async () => {
      const ticket = await mkTicket();
      const res = await request(app)
        .patch(`/api/tickets/${ticket.id}`).set("Cookie", cookie)
        .send({ teamId: 9999 });
      expect(res.status).toBe(400);
    });
  });

  describe("GET /api/tickets/:id and DELETE", () => {
    it("GET returns the full DTO; 404 for unknown id", async () => {
      const ticket = await mkTicket();
      const res = await request(app).get(`/api/tickets/${ticket.id}`).set("Cookie", cookie);
      expect(res.status).toBe(200);
      expect(res.body).toEqual(ticket);
      expect((await request(app).get("/api/tickets/9999").set("Cookie", cookie)).status).toBe(404);
    });

    it("DELETE removes the ticket and cascades its comments (§6)", async () => {
      const ticket = await mkTicket();
      await prisma.comment.createMany({
        data: [
          { ticketId: ticket.id, authorId: userId, body: "c1" },
          { ticketId: ticket.id, authorId: userId, body: "c2" },
        ],
      });
      const res = await request(app).delete(`/api/tickets/${ticket.id}`).set("Cookie", cookie);
      expect(res.status).toBe(204);
      expect(await prisma.ticket.count()).toBe(0);
      expect(await prisma.comment.count()).toBe(0);
    });

    it("DELETE returns 404 for an unknown id", async () => {
      expect((await request(app).delete("/api/tickets/9999").set("Cookie", cookie)).status).toBe(404);
    });
  });
});
