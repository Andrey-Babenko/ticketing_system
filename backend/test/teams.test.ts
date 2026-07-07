import { describe, it, expect, beforeEach } from "vitest";
import request from "supertest";
import { app } from "../src/app.js";
import { prisma } from "../src/lib/prisma.js";
import { authedCookie } from "./helpers.js";

const ISO_UTC = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;

let cookie: string;

beforeEach(async () => {
  cookie = await authedCookie();
});

async function createTeam(name: string) {
  return request(app).post("/api/teams").set("Cookie", cookie).send({ name });
}

describe("teams — CRUD, uniqueness, counts, 409 rules (S3.1)", () => {
  it("all four methods require authentication", async () => {
    expect((await request(app).get("/api/teams")).status).toBe(401);
    expect((await request(app).post("/api/teams").send({ name: "X" })).status).toBe(401);
    expect((await request(app).patch("/api/teams/1").send({ name: "X" })).status).toBe(401);
    expect((await request(app).delete("/api/teams/1")).status).toBe(401);
  });

  it("lists an empty array on a fresh database", async () => {
    const res = await request(app).get("/api/teams").set("Cookie", cookie);
    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });

  it("creates a team and returns the full DTO with ISO-8601 UTC timestamps (§9)", async () => {
    const res = await createTeam("Payments");
    expect(res.status).toBe(201);
    expect(Object.keys(res.body).sort()).toEqual([
      "createdAt",
      "epicCount",
      "id",
      "modifiedAt",
      "name",
      "ticketCount",
    ]);
    expect(res.body.name).toBe("Payments");
    expect(res.body.ticketCount).toBe(0);
    expect(res.body.epicCount).toBe(0);
    expect(res.body.createdAt).toMatch(ISO_UTC);
    expect(res.body.modifiedAt).toMatch(ISO_UTC);
  });

  it("trims the name before storing (§4)", async () => {
    const res = await createTeam("  Platform  ");
    expect(res.status).toBe(201);
    expect(res.body.name).toBe("Platform");
  });

  it("rejects an empty-after-trim name with field=name (§4)", async () => {
    const res = await createTeam("   ");
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION");
    expect(res.body.error.field).toBe("name");
    expect(await prisma.team.count()).toBe(0);
  });

  it("rejects a name longer than 200 characters", async () => {
    const res = await createTeam("x".repeat(201));
    expect(res.status).toBe(400);
  });

  it("rejects an exact duplicate name with 409 DUPLICATE_TEAM_NAME (§4)", async () => {
    await createTeam("Alpha");
    const res = await createTeam("Alpha");
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe("DUPLICATE_TEAM_NAME");
    expect(await prisma.team.count()).toBe(1);
  });

  it("rejects a case-variant duplicate with 409 (§4, ADR-12)", async () => {
    await createTeam("Alpha");
    const res = await createTeam("  ALPHA ");
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe("DUPLICATE_TEAM_NAME");
  });

  it("lists teams in case-insensitive name-ascending order", async () => {
    await createTeam("beta");
    await createTeam("Alpha");
    await createTeam("gamma");
    const res = await request(app).get("/api/teams").set("Cookie", cookie);
    expect(res.body.map((t: { name: string }) => t.name)).toEqual(["Alpha", "beta", "gamma"]);
  });

  it("returns live ticket and epic counts (wireframe 4)", async () => {
    const team = (await createTeam("Counted")).body;
    const user = await prisma.user.findFirstOrThrow();
    await prisma.epic.create({ data: { teamId: team.id, title: "E1" } });
    await prisma.ticket.createMany({
      data: [
        { teamId: team.id, type: "bug", title: "T1", body: "b", createdById: user.id },
        { teamId: team.id, type: "fix", title: "T2", body: "b", createdById: user.id },
      ],
    });
    const res = await request(app).get("/api/teams").set("Cookie", cookie);
    const dto = res.body.find((t: { id: number }) => t.id === team.id);
    expect(dto.ticketCount).toBe(2);
    expect(dto.epicCount).toBe(1);
  });

  it("renames a team and bumps modifiedAt", async () => {
    const team = (await createTeam("Old")).body;
    await new Promise((r) => setTimeout(r, 10));
    const res = await request(app)
      .patch(`/api/teams/${team.id}`)
      .set("Cookie", cookie)
      .send({ name: "New" });
    expect(res.status).toBe(200);
    expect(res.body.name).toBe("New");
    expect(new Date(res.body.modifiedAt).getTime()).toBeGreaterThan(
      new Date(team.modifiedAt).getTime()
    );
  });

  it("no-op rename (identical name) does not advance modifiedAt (§6 rule)", async () => {
    const team = (await createTeam("Same")).body;
    await new Promise((r) => setTimeout(r, 10));
    const res = await request(app)
      .patch(`/api/teams/${team.id}`)
      .set("Cookie", cookie)
      .send({ name: "Same" });
    expect(res.status).toBe(200);
    expect(res.body.modifiedAt).toBe(team.modifiedAt);
  });

  it("case-only rename of a team's own name succeeds (uniqueness excludes self)", async () => {
    const team = (await createTeam("payments")).body;
    const res = await request(app)
      .patch(`/api/teams/${team.id}`)
      .set("Cookie", cookie)
      .send({ name: "Payments" });
    expect(res.status).toBe(200);
    expect(res.body.name).toBe("Payments");
    expect(new Date(res.body.modifiedAt).getTime()).toBeGreaterThanOrEqual(
      new Date(team.modifiedAt).getTime()
    );
  });

  it("rejects renaming onto another team's name in a different case → 409", async () => {
    await createTeam("Alpha");
    const team = (await createTeam("Beta")).body;
    const res = await request(app)
      .patch(`/api/teams/${team.id}`)
      .set("Cookie", cookie)
      .send({ name: "ALPHA" });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe("DUPLICATE_TEAM_NAME");
  });

  it("rename of an unknown or non-numeric id returns 404", async () => {
    const missing = await request(app)
      .patch("/api/teams/9999")
      .set("Cookie", cookie)
      .send({ name: "X" });
    expect(missing.status).toBe(404);
    const nonNumeric = await request(app)
      .patch("/api/teams/abc")
      .set("Cookie", cookie)
      .send({ name: "X" });
    expect(nonNumeric.status).toBe(404);
  });

  it("rejects an empty rename with 400", async () => {
    const team = (await createTeam("NonEmpty")).body;
    const res = await request(app)
      .patch(`/api/teams/${team.id}`)
      .set("Cookie", cookie)
      .send({ name: " " });
    expect(res.status).toBe(400);
  });

  it("deletes an empty team → 204 and the row is gone", async () => {
    const team = (await createTeam("Doomed")).body;
    const res = await request(app).delete(`/api/teams/${team.id}`).set("Cookie", cookie);
    expect(res.status).toBe(204);
    expect(await prisma.team.count()).toBe(0);
  });

  it("delete of an unknown id returns 404", async () => {
    const res = await request(app).delete("/api/teams/9999").set("Cookie", cookie);
    expect(res.status).toBe(404);
  });

  it("refuses to delete a team containing a ticket → 409 TEAM_NOT_EMPTY (§4, §9)", async () => {
    const team = (await createTeam("Busy")).body;
    const user = await prisma.user.findFirstOrThrow();
    await prisma.ticket.create({
      data: { teamId: team.id, type: "bug", title: "T", body: "b", createdById: user.id },
    });
    const res = await request(app).delete(`/api/teams/${team.id}`).set("Cookie", cookie);
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe("TEAM_NOT_EMPTY");
    expect(await prisma.team.count()).toBe(1);
  });

  it("refuses to delete a team containing only an epic → 409 (§4)", async () => {
    const team = (await createTeam("Epicful")).body;
    await prisma.epic.create({ data: { teamId: team.id, title: "E" } });
    const res = await request(app).delete(`/api/teams/${team.id}`).set("Cookie", cookie);
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe("TEAM_NOT_EMPTY");
  });
});
