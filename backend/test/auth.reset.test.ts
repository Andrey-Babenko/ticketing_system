import { describe, it, expect, vi, beforeEach, beforeAll } from "vitest";
import request from "supertest";
import { createHash, randomBytes } from "node:crypto";
import argon2 from "argon2";
import { app } from "../src/app.js";
import { prisma } from "../src/lib/prisma.js";
import { sendVerificationEmail, sendPasswordResetEmail } from "../src/lib/mailer.js";

vi.mock("../src/lib/mailer.js", () => ({
  sendVerificationEmail: vi.fn().mockResolvedValue(undefined),
  sendPasswordResetEmail: vi.fn().mockResolvedValue(undefined),
}));
const mockSend = vi.mocked(sendPasswordResetEmail);
void sendVerificationEmail; // imported only to keep the mock factory shape honest

const HOUR_MS = 60 * 60 * 1000;
const PASSWORD = "password-123";
const GENERIC_MESSAGE =
  "If an account exists for this address, a password reset email has been sent.";

const sha256 = (v: string) => createHash("sha256").update(v).digest("hex");

let passwordHash: string;
beforeAll(async () => {
  passwordHash = await argon2.hash(PASSWORD);
});

function mkUser(
  email: string,
  opts: { verified?: boolean; resetTokenHash?: string | null; resetTokenExpiresAt?: Date | null } = {}
) {
  const { verified = true, resetTokenHash = null, resetTokenExpiresAt = null } = opts;
  return prisma.user.create({
    data: {
      email,
      passwordHash,
      emailVerifiedAt: verified ? new Date() : null,
      resetTokenHash,
      resetTokenExpiresAt,
    },
  });
}

const requestReset = (body: object) =>
  request(app).post("/api/auth/request-password-reset").send(body);
const resetPassword = (body: object) => request(app).post("/api/auth/reset-password").send(body);
const login = (body: object) => request(app).post("/api/auth/login").send(body);

describe("POST /api/auth/request-password-reset (S8.4, §14, ADR-17)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSend.mockResolvedValue(undefined);
  });

  it("verified account → 200 generic message, mails a token, stores only its hash", async () => {
    await mkUser("alice@x.com");
    const res = await requestReset({ email: "alice@x.com" });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ message: GENERIC_MESSAGE });

    expect(mockSend).toHaveBeenCalledTimes(1);
    const [, mailedToken] = mockSend.mock.calls[0];
    expect(mailedToken).toMatch(/^[A-Za-z0-9_-]{43}$/);

    const user = await prisma.user.findUnique({ where: { email: "alice@x.com" } });
    expect(user!.resetTokenHash).toBe(sha256(mailedToken));
    expect(user!.resetTokenHash).not.toBe(mailedToken);
    const expiresIn = user!.resetTokenExpiresAt!.getTime() - Date.now();
    expect(Math.abs(expiresIn - HOUR_MS)).toBeLessThan(10_000);
  });

  it("unknown email → identical generic 200, no mail sent (no enumeration)", async () => {
    const res = await requestReset({ email: "ghost@x.com" });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ message: GENERIC_MESSAGE });
    expect(mockSend).not.toHaveBeenCalled();
  });

  it("unverified account → identical generic 200, no mail sent (flows stay orthogonal)", async () => {
    await mkUser("bob@x.com", { verified: false });
    const res = await requestReset({ email: "bob@x.com" });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ message: GENERIC_MESSAGE });
    expect(mockSend).not.toHaveBeenCalled();
  });

  it("reissuing overwrites the previous token (only the latest hash validates)", async () => {
    await mkUser("carol@x.com");
    await requestReset({ email: "carol@x.com" });
    const firstToken = mockSend.mock.calls[0][1];

    await requestReset({ email: "carol@x.com" });
    const secondToken = mockSend.mock.calls[1][1];
    expect(secondToken).not.toBe(firstToken);

    const oldAttempt = await resetPassword({ token: firstToken, password: "new-password-1" });
    expect(oldAttempt.status).toBe(400);
    expect(oldAttempt.body.error.code).toBe("TOKEN_INVALID");

    const newAttempt = await resetPassword({ token: secondToken, password: "new-password-1" });
    expect(newAttempt.status).toBe(200);
  });

  it("normalizes the input email before lookup", async () => {
    await mkUser("dave@x.com");
    const res = await requestReset({ email: "  DAVE@X.com " });
    expect(res.status).toBe(200);
    expect(mockSend).toHaveBeenCalledTimes(1);
  });

  it("invalid email shape → 400 VALIDATION", async () => {
    const res = await requestReset({ email: "nope" });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION");
  });

  it("still returns generic 200 when SMTP send fails", async () => {
    await mkUser("erin@x.com");
    mockSend.mockRejectedValueOnce(new Error("smtp down"));
    const res = await requestReset({ email: "erin@x.com" });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ message: GENERIC_MESSAGE });
  });
});

describe("POST /api/auth/reset-password (S8.4, §14, ADR-17)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSend.mockResolvedValue(undefined);
  });

  async function mkUserWithToken(email: string, rawToken: string, expiresAt: Date) {
    return mkUser(email, { resetTokenHash: sha256(rawToken), resetTokenExpiresAt: expiresAt });
  }

  it("valid token + new password → 200, new password logs in, old one fails", async () => {
    await mkUserWithToken("alice@x.com", "tok-fresh", new Date(Date.now() + HOUR_MS));
    const res = await resetPassword({ token: "tok-fresh", password: "brand-new-pw" });
    expect(res.status).toBe(200);

    const oldLogin = await login({ email: "alice@x.com", password: PASSWORD });
    expect(oldLogin.status).toBe(401);
    const newLogin = await login({ email: "alice@x.com", password: "brand-new-pw" });
    expect(newLogin.status).toBe(200);
  });

  it("clears the reset token columns after a successful reset (single-use)", async () => {
    await mkUserWithToken("alice@x.com", "tok-fresh", new Date(Date.now() + HOUR_MS));
    await resetPassword({ token: "tok-fresh", password: "brand-new-pw" });
    const user = await prisma.user.findUnique({ where: { email: "alice@x.com" } });
    expect(user!.resetTokenHash).toBeNull();
    expect(user!.resetTokenExpiresAt).toBeNull();
  });

  it("reusing the same token after success → 400 TOKEN_INVALID", async () => {
    await mkUserWithToken("alice@x.com", "tok-fresh", new Date(Date.now() + HOUR_MS));
    await resetPassword({ token: "tok-fresh", password: "brand-new-pw" });
    const res = await resetPassword({ token: "tok-fresh", password: "another-pw-1" });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("TOKEN_INVALID");
  });

  it("expired token → 400 TOKEN_EXPIRED, password unchanged", async () => {
    await mkUserWithToken("alice@x.com", "tok-old", new Date(Date.now() - 1000));
    const res = await resetPassword({ token: "tok-old", password: "brand-new-pw" });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("TOKEN_EXPIRED");
    const stillOld = await login({ email: "alice@x.com", password: PASSWORD });
    expect(stillOld.status).toBe(200);
  });

  it("unknown/garbage token → 400 TOKEN_INVALID", async () => {
    const res = await resetPassword({ token: "totally-made-up", password: "brand-new-pw" });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("TOKEN_INVALID");
  });

  it("short password with a valid token → 400 on the password field, token still usable after", async () => {
    await mkUserWithToken("alice@x.com", "tok-fresh", new Date(Date.now() + HOUR_MS));
    const bad = await resetPassword({ token: "tok-fresh", password: "short1" });
    expect(bad.status).toBe(400);
    expect(bad.body.error.code).toBe("VALIDATION");
    expect(bad.body.error.field).toBe("password");

    const good = await resetPassword({ token: "tok-fresh", password: "valid-password-1" });
    expect(good.status).toBe(200);
  });

  it("revokes ALL of the user's existing sessions on success", async () => {
    const user = await mkUserWithToken("alice@x.com", "tok-fresh", new Date(Date.now() + HOUR_MS));
    const sid = randomBytes(16).toString("base64url");
    await prisma.session.create({
      data: { id: sid, userId: user.id, expiresAt: new Date(Date.now() + HOUR_MS) },
    });

    await resetPassword({ token: "tok-fresh", password: "brand-new-pw" });

    const me = await request(app).get("/api/auth/me").set("Cookie", `sid=${sid}`);
    expect(me.status).toBe(401);
    expect(await prisma.session.count({ where: { userId: user.id } })).toBe(0);
  });

  it("missing token or password → 400 VALIDATION", async () => {
    expect((await resetPassword({ password: "brand-new-pw" })).status).toBe(400);
    expect((await resetPassword({ token: "tok-fresh" })).status).toBe(400);
  });

  it("does not require authentication (public endpoint)", async () => {
    const res = await resetPassword({ token: "garbage", password: "brand-new-pw" });
    expect(res.status).not.toBe(401);
  });
});
