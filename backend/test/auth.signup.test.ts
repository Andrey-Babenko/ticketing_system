import { describe, it, expect, vi, beforeEach } from "vitest";
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

const DAY_MS = 24 * 60 * 60 * 1000;

function signup(body: object) {
  return request(app).post("/api/auth/signup").send(body);
}

describe("POST /api/auth/signup (S1.1, §3, ADR-9/12)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSend.mockResolvedValue(undefined);
  });

  it("creates an account: 201 with exactly {id, email}", async () => {
    const res = await signup({ email: "alice@example.com", password: "password-123" });
    expect(res.status).toBe(201);
    expect(Object.keys(res.body).sort()).toEqual(["email", "id"]);
    expect(res.body.email).toBe("alice@example.com");
  });

  it("stores the user unverified with a 24h verification token", async () => {
    await signup({ email: "alice@example.com", password: "password-123" });
    const user = await prisma.user.findUnique({ where: { email: "alice@example.com" } });
    expect(user!.emailVerifiedAt).toBeNull();
    expect(user!.verificationToken).toMatch(/^[A-Za-z0-9_-]{43}$/);
    const expiresIn = user!.verificationTokenExpiresAt!.getTime() - Date.now();
    expect(Math.abs(expiresIn - DAY_MS)).toBeLessThan(60_000);
  });

  it("hashes the password with argon2id, never storing plaintext", async () => {
    await signup({ email: "alice@example.com", password: "password-123" });
    const user = await prisma.user.findUnique({ where: { email: "alice@example.com" } });
    expect(user!.passwordHash.startsWith("$argon2id$")).toBe(true);
    expect(user!.passwordHash).not.toContain("password-123");
    expect(await argon2.verify(user!.passwordHash, "password-123")).toBe(true);
  });

  it("sends the verification email with the stored token", async () => {
    await signup({ email: "alice@example.com", password: "password-123" });
    const user = await prisma.user.findUnique({ where: { email: "alice@example.com" } });
    expect(mockSend).toHaveBeenCalledTimes(1);
    expect(mockSend).toHaveBeenCalledWith("alice@example.com", user!.verificationToken);
  });

  it("trims and lowercases the email before storing (ADR-12)", async () => {
    const res = await signup({ email: "  Bob@EXAMPLE.Com ", password: "password-123" });
    expect(res.status).toBe(201);
    expect(res.body.email).toBe("bob@example.com");
    expect(await prisma.user.findUnique({ where: { email: "bob@example.com" } })).not.toBeNull();
  });

  it("rejects a duplicate email with 409 EMAIL_TAKEN", async () => {
    await signup({ email: "carol@example.com", password: "password-123" });
    const res = await signup({ email: "carol@example.com", password: "password-456" });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe("EMAIL_TAKEN");
    expect(await prisma.user.count()).toBe(1);
    expect(mockSend).toHaveBeenCalledTimes(1);
  });

  it("rejects a case/whitespace variant of an existing email with 409", async () => {
    await signup({ email: "carol@example.com", password: "password-123" });
    const res = await signup({ email: "  CAROL@EXAMPLE.COM ", password: "password-456" });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe("EMAIL_TAKEN");
  });

  it("rejects a 7-character password with 400 on the password field", async () => {
    const res = await signup({ email: "dave@example.com", password: "seven77" });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION");
    expect(res.body.error.field).toBe("password");
    expect(await prisma.user.count()).toBe(0);
    expect(mockSend).not.toHaveBeenCalled();
  });

  it("rejects a 129-character password with 400", async () => {
    const res = await signup({ email: "dave@example.com", password: "x".repeat(129) });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION");
  });

  it("rejects an invalid email shape with 400 on the email field", async () => {
    const res = await signup({ email: "not-an-email", password: "password-123" });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION");
    expect(res.body.error.field).toBe("email");
  });

  it("rejects an empty body with 400", async () => {
    const res = await signup({});
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION");
  });

  it("still returns 201 when the SMTP send fails (resend is the recovery path)", async () => {
    mockSend.mockRejectedValueOnce(new Error("smtp down"));
    const res = await signup({ email: "eve@example.com", password: "password-123" });
    expect(res.status).toBe(201);
    const user = await prisma.user.findUnique({ where: { email: "eve@example.com" } });
    expect(user).not.toBeNull();
    expect(user!.verificationToken).toBeTruthy();
  });
});
