import { describe, it, expect, beforeEach } from "vitest";
import request from "supertest";
import { app } from "../src/app.js";
import { prisma } from "../src/lib/prisma.js";
import { authedCookie } from "./helpers.js";

const ISO_UTC = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;

async function mkTeam(name: string) {
  return prisma.team.create({ data: { name } });
}

async function mkEpic(teamId: number, title: string, description?: string) {
  return prisma.epic.create({ data: { teamId, title, description } });
}

describe("epics API (S4.1, §5)", () => {
  let cookie: string;
  let teamId: number;

  beforeEach(async () => {
    cookie = await authedCookie();
    teamId = (await mkTeam("Payments")).id;
  });

  it("requires authentication on every method", async () => {
    expect((await request(app).get(`/api/epics?teamId=${teamId}`)).status).toBe(401);
    expect((await request(app).post("/api/epics").send({ teamId, title: "X" })).status).toBe(401);
    expect((await request(app).patch("/api/epics/1").send({ title: "X" })).status).toBe(401);
    expect((await request(app).delete("/api/epics/1")).status).toBe(401);
  });

  it("GET without teamId returns 400", async () => {
    const res = await request(app).get("/api/epics").set("Cookie", cookie);
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION");
  });

  it("GET with a non-numeric teamId returns 400", async () => {
    const res = await request(app).get("/api/epics?teamId=abc").set("Cookie", cookie);
    expect(res.status).toBe(400);
  });

  it("GET for an unknown team returns 404", async () => {
    const res = await request(app).get("/api/epics?teamId=9999").set("Cookie", cookie);
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe("NOT_FOUND");
  });

  it("GET returns [] for a team with no epics", async () => {
    const res = await request(app).get(`/api/epics?teamId=${teamId}`).set("Cookie", cookie);
    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });

  it("POST creates an epic with the exact contract DTO and ISO-8601 UTC timestamps (§9)", async () => {
    const res = await request(app)
      .post("/api/epics")
      .set("Cookie", cookie)
      .send({ teamId, title: "Checkout flow" });
    expect(res.status).toBe(201);
    expect(Object.keys(res.body).sort()).toEqual([
      "createdAt",
      "description",
      "id",
      "modifiedAt",
      "teamId",
      "ticketCount",
      "title",
    ]);
    expect(res.body).toMatchObject({
      teamId,
      title: "Checkout flow",
      description: null,
      ticketCount: 0,
    });
    expect(res.body.createdAt).toMatch(ISO_UTC);
    expect(res.body.modifiedAt).toMatch(ISO_UTC);
  });

  it("POST trims the title", async () => {
    const res = await request(app)
      .post("/api/epics")
      .set("Cookie", cookie)
      .send({ teamId, title: "  Padded  " });
    expect(res.status).toBe(201);
    expect(res.body.title).toBe("Padded");
  });

  it("POST rejects a whitespace-only title (§5 non-empty after trim)", async () => {
    const res = await request(app)
      .post("/api/epics")
      .set("Cookie", cookie)
      .send({ teamId, title: "   " });
    expect(res.status).toBe(400);
    expect(res.body.error.field).toBe("title");
    expect(await prisma.epic.count()).toBe(0);
  });

  it("POST rejects a dangling teamId with 400", async () => {
    const res = await request(app)
      .post("/api/epics")
      .set("Cookie", cookie)
      .send({ teamId: 9999, title: "Ghost" });
    expect(res.status).toBe(400);
  });

  it("allows duplicate titles within a team (§5 deliberately omits uniqueness)", async () => {
    const first = await request(app)
      .post("/api/epics")
      .set("Cookie", cookie)
      .send({ teamId, title: "Same" });
    const second = await request(app)
      .post("/api/epics")
      .set("Cookie", cookie)
      .send({ teamId, title: "Same" });
    expect(first.status).toBe(201);
    expect(second.status).toBe(201);
  });

  it("trims description and stores empty-after-trim as null", async () => {
    const res = await request(app)
      .post("/api/epics")
      .set("Cookie", cookie)
      .send({ teamId, title: "Desc test", description: "   " });
    expect(res.status).toBe(201);
    expect(res.body.description).toBeNull();

    const res2 = await request(app)
      .post("/api/epics")
      .set("Cookie", cookie)
      .send({ teamId, title: "Desc test 2", description: "  keep me  " });
    expect(res2.body.description).toBe("keep me");
  });

  it("PATCH updates title and description and bumps modifiedAt", async () => {
    const epic = await mkEpic(teamId, "Before");
    await new Promise((r) => setTimeout(r, 5));
    const res = await request(app)
      .patch(`/api/epics/${epic.id}`)
      .set("Cookie", cookie)
      .send({ title: "After", description: "now set" });
    expect(res.status).toBe(200);
    expect(res.body.title).toBe("After");
    expect(res.body.description).toBe("now set");
    expect(new Date(res.body.modifiedAt).getTime()).toBeGreaterThan(
      epic.modifiedAt.getTime()
    );
  });

  it("no-op PATCH leaves modifiedAt byte-identical (§6 rule generalized)", async () => {
    const epic = await mkEpic(teamId, "Stable", "same desc");
    const res = await request(app)
      .patch(`/api/epics/${epic.id}`)
      .set("Cookie", cookie)
      .send({ title: "Stable", description: "same desc" });
    expect(res.status).toBe(200);
    expect(res.body.modifiedAt).toBe(epic.modifiedAt.toISOString());
  });

  it("PATCH containing teamId is rejected with 400 (§5 team immutability, strict schema)", async () => {
    const other = await mkTeam("Other");
    const epic = await mkEpic(teamId, "Anchored");
    const res = await request(app)
      .patch(`/api/epics/${epic.id}`)
      .set("Cookie", cookie)
      .send({ teamId: other.id, title: "Anchored" });
    expect(res.status).toBe(400);
    const unchanged = await prisma.epic.findUnique({ where: { id: epic.id } });
    expect(unchanged!.teamId).toBe(teamId);
  });

  it("PATCH on an unknown epic returns 404", async () => {
    const res = await request(app)
      .patch("/api/epics/9999")
      .set("Cookie", cookie)
      .send({ title: "Nope" });
    expect(res.status).toBe(404);
  });

  it("DELETE removes an unreferenced epic", async () => {
    const epic = await mkEpic(teamId, "Doomed");
    const res = await request(app).delete(`/api/epics/${epic.id}`).set("Cookie", cookie);
    expect(res.status).toBe(204);
    expect(await prisma.epic.count()).toBe(0);
  });

  it("DELETE on an epic referenced by tickets returns 409 EPIC_REFERENCED (§5/§9)", async () => {
    const epic = await mkEpic(teamId, "Referenced");
    const user = await prisma.user.findFirstOrThrow();
    await prisma.ticket.create({
      data: { teamId, epicId: epic.id, type: "bug", title: "T", body: "B", createdById: user.id },
    });
    const res = await request(app).delete(`/api/epics/${epic.id}`).set("Cookie", cookie);
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe("EPIC_REFERENCED");
    expect(await prisma.epic.count()).toBe(1);
  });

  it("DELETE on an unknown epic returns 404", async () => {
    const res = await request(app).delete("/api/epics/9999").set("Cookie", cookie);
    expect(res.status).toBe(404);
  });

  it("GET returns only the requested team's epics, title CI-ascending", async () => {
    const other = await mkTeam("Zeta");
    await mkEpic(teamId, "beta");
    await mkEpic(teamId, "Alpha");
    await mkEpic(teamId, "gamma");
    await mkEpic(other.id, "Elsewhere");
    const res = await request(app).get(`/api/epics?teamId=${teamId}`).set("Cookie", cookie);
    expect(res.status).toBe(200);
    expect(res.body.map((e: { title: string }) => e.title)).toEqual(["Alpha", "beta", "gamma"]);
  });
});
