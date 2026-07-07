import { describe, it, expect, beforeEach } from "vitest";
import request from "supertest";
import { app } from "../src/app.js";
import { prisma } from "../src/lib/prisma.js";
import { authedCookie } from "./helpers.js";

describe("comment edit/delete API (S8.1, §7/§14)", () => {
  let cookie: string;
  let otherCookie: string;
  let ticketId: number;
  let commentId: number;

  beforeEach(async () => {
    cookie = await authedCookie("author@example.com");
    otherCookie = await authedCookie("other@example.com");
    const author = await prisma.user.findUniqueOrThrow({ where: { email: "author@example.com" } });
    const team = await prisma.team.create({ data: { name: "Payments" } });
    const ticket = await prisma.ticket.create({
      data: { teamId: team.id, type: "bug", title: "T", body: "B", createdById: author.id },
    });
    ticketId = ticket.id;
    const comment = await prisma.comment.create({
      data: { ticketId, authorId: author.id, body: "original" },
    });
    commentId = comment.id;
  });

  function url(id = commentId) {
    return `/api/tickets/${ticketId}/comments/${id}`;
  }

  it("requires authentication", async () => {
    expect((await request(app).patch(url()).send({ body: "x" })).status).toBe(401);
    expect((await request(app).delete(url())).status).toBe(401);
  });

  it("author can edit their own comment; sets editedAt (§7, ADR-15)", async () => {
    const res = await request(app).patch(url()).set("Cookie", cookie).send({ body: "  edited!  " });
    expect(res.status).toBe(200);
    expect(res.body.body).toBe("edited!");
    expect(res.body.editedAt).toEqual(expect.any(String));
    expect(new Date(res.body.editedAt).toISOString()).toBe(res.body.editedAt);
  });

  it("a second edit updates editedAt again", async () => {
    const first = await request(app).patch(url()).set("Cookie", cookie).send({ body: "one" });
    const second = await request(app).patch(url()).set("Cookie", cookie).send({ body: "two" });
    expect(second.body.body).toBe("two");
    expect(second.body.editedAt).not.toBe(first.body.editedAt);
  });

  it("editing/deleting a comment leaves the ticket's modifiedAt byte-identical (§7)", async () => {
    const before = await prisma.ticket.findUniqueOrThrow({ where: { id: ticketId } });
    await request(app).patch(url()).set("Cookie", cookie).send({ body: "edited" });
    const afterEdit = await prisma.ticket.findUniqueOrThrow({ where: { id: ticketId } });
    expect(afterEdit.modifiedAt.toISOString()).toBe(before.modifiedAt.toISOString());

    await request(app).delete(url()).set("Cookie", cookie);
    const afterDelete = await prisma.ticket.findUniqueOrThrow({ where: { id: ticketId } });
    expect(afterDelete.modifiedAt.toISOString()).toBe(before.modifiedAt.toISOString());
  });

  it("rejects edit/delete by a non-author with 403 FORBIDDEN", async () => {
    const patch = await request(app).patch(url()).set("Cookie", otherCookie).send({ body: "hijacked" });
    expect(patch.status).toBe(403);
    expect(patch.body.error.code).toBe("FORBIDDEN");

    const del = await request(app).delete(url()).set("Cookie", otherCookie);
    expect(del.status).toBe(403);
    expect(del.body.error.code).toBe("FORBIDDEN");

    const unchanged = await prisma.comment.findUniqueOrThrow({ where: { id: commentId } });
    expect(unchanged.body).toBe("original");
  });

  it("rejects a whitespace-only body on edit with 400", async () => {
    const res = await request(app).patch(url()).set("Cookie", cookie).send({ body: "   " });
    expect(res.status).toBe(400);
    expect(res.body.error.field).toBe("body");
  });

  it("author can delete their own comment; it disappears from the list", async () => {
    const res = await request(app).delete(url()).set("Cookie", cookie);
    expect(res.status).toBe(204);

    const list = await request(app).get(`/api/tickets/${ticketId}/comments`).set("Cookie", cookie);
    expect(list.body).toEqual([]);
  });

  it("returns 404 for an unknown comment id or one belonging to a different ticket", async () => {
    expect((await request(app).patch(url(999999)).set("Cookie", cookie).send({ body: "x" })).status).toBe(404);
    expect((await request(app).delete(url(999999)).set("Cookie", cookie)).status).toBe(404);

    const otherTeam = await prisma.team.create({ data: { name: "Other" } });
    const otherAuthor = await prisma.user.findUniqueOrThrow({ where: { email: "author@example.com" } });
    const otherTicket = await prisma.ticket.create({
      data: { teamId: otherTeam.id, type: "bug", title: "T2", body: "B2", createdById: otherAuthor.id },
    });
    const foreignUrl = `/api/tickets/${otherTicket.id}/comments/${commentId}`;
    expect((await request(app).patch(foreignUrl).set("Cookie", cookie).send({ body: "x" })).status).toBe(404);
    expect((await request(app).delete(foreignUrl).set("Cookie", cookie)).status).toBe(404);
  });
});
