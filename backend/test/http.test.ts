import { describe, it, expect } from "vitest";
import request from "supertest";
import { app } from "../src/app.js";
import { prisma } from "../src/lib/prisma.js";

async function mkVerifiedUser(email: string) {
  return prisma.user.create({
    data: { email, passwordHash: "x", emailVerifiedAt: new Date() },
  });
}

async function mkSession(userId: number, expiresAt: Date, id = "test-session-id") {
  return prisma.session.create({ data: { id, userId, expiresAt } });
}

describe("http — envelope and session auth (S0.2)", () => {
  it("GET /api/health is public and returns ok", async () => {
    const res = await request(app).get("/api/health");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: "ok" });
  });

  it("unauthenticated request to an unknown route returns 401, not 404 (deny by default)", async () => {
    const res = await request(app).get("/api/nope");
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe("UNAUTHENTICATED");
  });

  it("authenticated request to an unknown route returns a 404 envelope", async () => {
    const user = await mkVerifiedUser("notfound@example.com");
    await mkSession(user.id, new Date(Date.now() + 7 * 86400000));

    const res = await request(app).get("/api/nope").set("Cookie", "sid=test-session-id");
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe("NOT_FOUND");
  });

  it("malformed JSON body returns a 400 VALIDATION envelope", async () => {
    const res = await request(app)
      .post("/api/auth/signup")
      .set("Content-Type", "application/json")
      .send("{not valid json");
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION");
  });

  it("protected route without a session cookie returns 401", async () => {
    const res = await request(app).get("/api/auth/me");
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe("UNAUTHENTICATED");
  });

  it("protected route with a valid session cookie returns the user", async () => {
    const user = await mkVerifiedUser("me@example.com");
    await mkSession(user.id, new Date(Date.now() + 7 * 86400000));

    const res = await request(app).get("/api/auth/me").set("Cookie", "sid=test-session-id");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ id: user.id, email: user.email });
  });

  it("expired session returns 401 and the session row is deleted", async () => {
    const user = await mkVerifiedUser("expired@example.com");
    await mkSession(user.id, new Date(Date.now() - 1000));

    const res = await request(app).get("/api/auth/me").set("Cookie", "sid=test-session-id");
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe("UNAUTHENTICATED");
    expect(await prisma.session.findUnique({ where: { id: "test-session-id" } })).toBeNull();
  });

  it("rolling extension: a session with >24h already consumed gets extended to ~7d", async () => {
    const user = await mkVerifiedUser("rolling@example.com");
    // 7d - 5d consumed = 2d remaining < 6d threshold → should extend
    await mkSession(user.id, new Date(Date.now() + 2 * 86400000));

    await request(app).get("/api/auth/me").set("Cookie", "sid=test-session-id");

    const session = await prisma.session.findUnique({ where: { id: "test-session-id" } });
    const remainingMs = session!.expiresAt.getTime() - Date.now();
    expect(remainingMs).toBeGreaterThan(6.9 * 86400000);
  });

  it("rolling extension: a session with <24h consumed is left untouched", async () => {
    const user = await mkVerifiedUser("fresh@example.com");
    const original = new Date(Date.now() + 6.9 * 86400000);
    await mkSession(user.id, original);

    await request(app).get("/api/auth/me").set("Cookie", "sid=test-session-id");

    const session = await prisma.session.findUnique({ where: { id: "test-session-id" } });
    expect(Math.abs(session!.expiresAt.getTime() - original.getTime())).toBeLessThan(1000);
  });
});
