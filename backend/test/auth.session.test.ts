import { describe, it, expect, vi, beforeEach, beforeAll } from "vitest";
import request from "supertest";
import argon2 from "argon2";
import { app } from "../src/app.js";
import { prisma } from "../src/lib/prisma.js";
import { sendVerificationEmail } from "../src/lib/mailer.js";

vi.mock("../src/lib/mailer.js", () => ({
  sendVerificationEmail: vi.fn().mockResolvedValue(undefined),
  sendPasswordResetEmail: vi.fn().mockResolvedValue(undefined),
}));
const mockSend = vi.mocked(sendVerificationEmail);

const PASSWORD = "password-123";
const DAY_MS = 24 * 60 * 60 * 1000;

// One argon2 hash for the whole file (~100ms) instead of one per test.
let passwordHash: string;
beforeAll(async () => {
  passwordHash = await argon2.hash(PASSWORD);
});

function mkUser(email: string, { verified = true } = {}) {
  return prisma.user.create({
    data: { email, passwordHash, emailVerifiedAt: verified ? new Date() : null },
  });
}

const login = (body: object) => request(app).post("/api/auth/login").send(body);

describe("POST /api/auth/login + logout + sessions (S1.3, §3, ADR-3/8)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSend.mockResolvedValue(undefined);
  });

  it("logs in a verified user: 200, correct body, hardened cookie", async () => {
    const user = await mkUser("alice@x.com");
    const res = await login({ email: "alice@x.com", password: PASSWORD });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ id: user.id, email: "alice@x.com" });

    const cookie = res.headers["set-cookie"]![0];
    expect(cookie).toMatch(/^sid=[A-Za-z0-9_-]{43};/);
    expect(cookie).toMatch(/HttpOnly/i);
    expect(cookie).toMatch(/SameSite=Lax/i);
    expect(cookie).toMatch(/Path=\//);
    expect(cookie).toMatch(/Max-Age=604800/);
  });

  it("creates a session row expiring in ~7 days", async () => {
    const user = await mkUser("alice@x.com");
    const res = await login({ email: "alice@x.com", password: PASSWORD });
    const sid = res.headers["set-cookie"]![0].match(/^sid=([^;]+);/)![1];

    const session = await prisma.session.findUnique({ where: { id: sid } });
    expect(session!.userId).toBe(user.id);
    const remaining = session!.expiresAt.getTime() - Date.now();
    expect(Math.abs(remaining - 7 * DAY_MS)).toBeLessThan(60_000);
  });

  it("wrong password → 401 INVALID_CREDENTIALS, no session, no cookie", async () => {
    await mkUser("alice@x.com");
    const res = await login({ email: "alice@x.com", password: "wrong-password" });
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe("INVALID_CREDENTIALS");
    expect(res.headers["set-cookie"]).toBeUndefined();
    expect(await prisma.session.count()).toBe(0);
  });

  it("unknown email → 401 INVALID_CREDENTIALS", async () => {
    const res = await login({ email: "ghost@x.com", password: PASSWORD });
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe("INVALID_CREDENTIALS");
  });

  it("wrong password on an UNVERIFIED account → 401, not 403 (ADR-3 ordering)", async () => {
    await mkUser("bob@x.com", { verified: false });
    const res = await login({ email: "bob@x.com", password: "wrong-password" });
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe("INVALID_CREDENTIALS");
  });

  it("correct password on an unverified account → 403 EMAIL_NOT_VERIFIED, NO session", async () => {
    await mkUser("bob@x.com", { verified: false });
    const res = await login({ email: "bob@x.com", password: PASSWORD });
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe("EMAIL_NOT_VERIFIED");
    expect(res.headers["set-cookie"]).toBeUndefined();
    expect(await prisma.session.count()).toBe(0);
  });

  it("normalizes the login email", async () => {
    await mkUser("eve@x.com");
    const res = await login({ email: "  EVE@X.com ", password: PASSWORD });
    expect(res.status).toBe(200);
  });

  it("short password → 400 VALIDATION (schema reuse)", async () => {
    const res = await login({ email: "alice@x.com", password: "seven77" });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION");
  });

  it("logout revokes the session: 204, row gone, cookie cleared, /me → 401", async () => {
    await mkUser("alice@x.com");
    const agent = request.agent(app);
    await agent.post("/api/auth/login").send({ email: "alice@x.com", password: PASSWORD });

    const res = await agent.post("/api/auth/logout");
    expect(res.status).toBe(204);
    expect(res.headers["set-cookie"]![0]).toMatch(/^sid=;/);
    expect(await prisma.session.count()).toBe(0);

    const me = await agent.get("/api/auth/me");
    expect(me.status).toBe(401);
  });

  it("logout without a cookie → 401 UNAUTHENTICATED (protected endpoint)", async () => {
    const res = await request(app).post("/api/auth/logout");
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe("UNAUTHENTICATED");
  });

  it("§11 business flow: signup → emailed token verifies → login → me → logout → 401", async () => {
    const agent = request.agent(app);

    const signupRes = await agent
      .post("/api/auth/signup")
      .send({ email: "flow@x.com", password: PASSWORD });
    expect(signupRes.status).toBe(201);

    // The token QA would click comes from the email — take it from the mailer call.
    const emailedToken = mockSend.mock.calls[0][1];
    const verifyRes = await agent.post("/api/auth/verify").send({ token: emailedToken });
    expect(verifyRes.status).toBe(200);
    expect(verifyRes.body).toEqual({ status: "verified" });

    const loginRes = await agent
      .post("/api/auth/login")
      .send({ email: "flow@x.com", password: PASSWORD });
    expect(loginRes.status).toBe(200);

    const meRes = await agent.get("/api/auth/me");
    expect(meRes.status).toBe(200);
    expect(meRes.body).toEqual({ id: signupRes.body.id, email: "flow@x.com" });

    const logoutRes = await agent.post("/api/auth/logout");
    expect(logoutRes.status).toBe(204);

    const meAfter = await agent.get("/api/auth/me");
    expect(meAfter.status).toBe(401);
  });
});
