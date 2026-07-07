import { describe, it, expect, beforeEach } from "vitest";
import request from "supertest";
import { app } from "../src/app.js";
import { prisma } from "../src/lib/prisma.js";
import { authedCookie } from "./helpers.js";

describe("comments API (S5.3, §7)", () => {
  let cookie: string;
  let userId: number;
  let ticketId: number;

  beforeEach(async () => {
    cookie = await authedCookie();
    userId = (await prisma.user.findFirstOrThrow()).id;
    const team = await prisma.team.create({ data: { name: "Payments" } });
    const ticket = await prisma.ticket.create({
      data: { teamId: team.id, type: "bug", title: "T", body: "B", createdById: userId },
    });
    ticketId = ticket.id;
  });

  it("requires authentication", async () => {
    expect((await request(app).get(`/api/tickets/${ticketId}/comments`)).status).toBe(401);
    expect(
      (await request(app).post(`/api/tickets/${ticketId}/comments`).send({ body: "x" })).status
    ).toBe(401);
  });

  it("POST creates a comment with the contract DTO; author from session", async () => {
    const res = await request(app)
      .post(`/api/tickets/${ticketId}/comments`)
      .set("Cookie", cookie)
      .send({ body: "  First!  " });
    expect(res.status).toBe(201);
    expect(Object.keys(res.body).sort()).toEqual(["author", "body", "createdAt", "id", "ticketId"]);
    expect(res.body).toMatchObject({
      ticketId,
      body: "First!",
      author: { id: userId, email: "tester@example.com" },
    });
  });

  it("posting a comment leaves the ticket's modifiedAt byte-identical (§7 — THE invariant)", async () => {
    const before = await prisma.ticket.findUniqueOrThrow({ where: { id: ticketId } });
    await request(app)
      .post(`/api/tickets/${ticketId}/comments`)
      .set("Cookie", cookie)
      .send({ body: "does not touch the ticket" });
    const after = await prisma.ticket.findUniqueOrThrow({ where: { id: ticketId } });
    expect(after.modifiedAt.toISOString()).toBe(before.modifiedAt.toISOString());
  });

  it("rejects a whitespace-only body and unknown keys with 400", async () => {
    const blank = await request(app)
      .post(`/api/tickets/${ticketId}/comments`)
      .set("Cookie", cookie)
      .send({ body: "   " });
    expect(blank.status).toBe(400);
    expect(blank.body.error.field).toBe("body");

    const unknown = await request(app)
      .post(`/api/tickets/${ticketId}/comments`)
      .set("Cookie", cookie)
      .send({ body: "x", author: "spoofed" });
    expect(unknown.status).toBe(400);
  });

  it("returns 404 for unknown or beyond-INT4 ticket ids on GET and POST", async () => {
    expect(
      (await request(app).get("/api/tickets/9999/comments").set("Cookie", cookie)).status
    ).toBe(404);
    expect(
      (await request(app).post("/api/tickets/9999/comments").set("Cookie", cookie)
        .send({ body: "x" })).status
    ).toBe(404);
    expect(
      (await request(app).get("/api/tickets/2147483648/comments").set("Cookie", cookie)).status
    ).toBe(404);
  });

  it("GET returns [] for a commentless ticket", async () => {
    const res = await request(app)
      .get(`/api/tickets/${ticketId}/comments`)
      .set("Cookie", cookie);
    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });

  it("lists comments oldest-first with id tiebreak on equal timestamps (§7)", async () => {
    const pinned = new Date("2026-01-01T00:00:00.000Z");
    const c1 = await prisma.comment.create({
      data: { ticketId, authorId: userId, body: "first", createdAt: pinned },
    });
    const c2 = await prisma.comment.create({
      data: { ticketId, authorId: userId, body: "second", createdAt: pinned },
    });
    const later = await prisma.comment.create({
      data: { ticketId, authorId: userId, body: "third", createdAt: new Date("2026-01-02T00:00:00.000Z") },
    });

    const res = await request(app)
      .get(`/api/tickets/${ticketId}/comments`)
      .set("Cookie", cookie);
    expect(res.body.map((c: { id: number }) => c.id)).toEqual([c1.id, c2.id, later.id]);
  });
});
