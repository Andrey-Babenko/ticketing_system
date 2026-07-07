import { describe, it, expect, vi, beforeEach } from "vitest";
import request from "supertest";
import { app } from "../src/app.js";
import { prisma } from "../src/lib/prisma.js";
import { sendVerificationEmail } from "../src/lib/mailer.js";

vi.mock("../src/lib/mailer.js", () => ({
  sendVerificationEmail: vi.fn().mockResolvedValue(undefined),
}));
const mockSend = vi.mocked(sendVerificationEmail);

const DAY_MS = 24 * 60 * 60 * 1000;
const GENERIC_RESEND_MESSAGE =
  "If an unverified account exists for this address, a new verification email has been sent.";

function mkUser(
  email: string,
  opts: { token?: string | null; expiresAt?: Date | null; verifiedAt?: Date | null } = {}
) {
  return prisma.user.create({
    data: {
      email,
      passwordHash: "x",
      verificationToken: opts.token ?? null,
      verificationTokenExpiresAt: opts.expiresAt ?? null,
      emailVerifiedAt: opts.verifiedAt ?? null,
    },
  });
}

const verify = (body: object) => request(app).post("/api/auth/verify").send(body);
const resend = (body: object) => request(app).post("/api/auth/resend-verification").send(body);

describe("POST /api/auth/verify (S1.2, §3, ADR-9)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSend.mockResolvedValue(undefined);
  });

  it("verifies a fresh token: 200 verified, emailVerifiedAt set, token kept", async () => {
    await mkUser("a@x.com", { token: "tok-fresh", expiresAt: new Date(Date.now() + DAY_MS) });
    const res = await verify({ token: "tok-fresh" });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: "verified" });
    const user = await prisma.user.findUnique({ where: { email: "a@x.com" } });
    expect(user!.emailVerifiedAt).not.toBeNull();
    expect(user!.verificationToken).toBe("tok-fresh"); // kept — re-use is a no-op (ADR-9)
  });

  it("second call with the same token → 200 already_verified (double-click safe)", async () => {
    await mkUser("a@x.com", { token: "tok-fresh", expiresAt: new Date(Date.now() + DAY_MS) });
    await verify({ token: "tok-fresh" });
    const res = await verify({ token: "tok-fresh" });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: "already_verified" });
  });

  it("expired token → 400 TOKEN_EXPIRED, account stays unverified", async () => {
    await mkUser("a@x.com", { token: "tok-old", expiresAt: new Date(Date.now() - 1000) });
    const res = await verify({ token: "tok-old" });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("TOKEN_EXPIRED");
    const user = await prisma.user.findUnique({ where: { email: "a@x.com" } });
    expect(user!.emailVerifiedAt).toBeNull();
  });

  it("unknown token → 400 TOKEN_INVALID", async () => {
    const res = await verify({ token: "garbage" });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("TOKEN_INVALID");
  });

  it("verified account with past expiry → already_verified (verified-check beats expiry)", async () => {
    await mkUser("a@x.com", {
      token: "tok-old",
      expiresAt: new Date(Date.now() - 1000),
      verifiedAt: new Date(),
    });
    const res = await verify({ token: "tok-old" });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: "already_verified" });
  });

  it("missing or empty token → 400 VALIDATION", async () => {
    expect((await verify({})).status).toBe(400);
    const res = await verify({ token: "" });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION");
  });
});

describe("POST /api/auth/resend-verification (S1.2, §3, ADR-6/9)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSend.mockResolvedValue(undefined);
  });

  it("reissues for an unverified account: token rotates, expiry refreshed, new token mailed", async () => {
    await mkUser("b@x.com", { token: "tok-old", expiresAt: new Date(Date.now() + 1000) });
    const res = await resend({ email: "b@x.com" });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ message: GENERIC_RESEND_MESSAGE });

    const user = await prisma.user.findUnique({ where: { email: "b@x.com" } });
    expect(user!.verificationToken).not.toBe("tok-old");
    const expiresIn = user!.verificationTokenExpiresAt!.getTime() - Date.now();
    expect(Math.abs(expiresIn - DAY_MS)).toBeLessThan(60_000);
    expect(mockSend).toHaveBeenCalledWith("b@x.com", user!.verificationToken);
  });

  it("after resend the old token is dead and the new one verifies", async () => {
    await mkUser("b@x.com", { token: "tok-old", expiresAt: new Date(Date.now() + DAY_MS) });
    await resend({ email: "b@x.com" });
    const user = await prisma.user.findUnique({ where: { email: "b@x.com" } });

    const oldRes = await verify({ token: "tok-old" });
    expect(oldRes.status).toBe(400);
    expect(oldRes.body.error.code).toBe("TOKEN_INVALID");

    const newRes = await verify({ token: user!.verificationToken! });
    expect(newRes.status).toBe(200);
    expect(newRes.body).toEqual({ status: "verified" });
  });

  it("verified account → same generic 200, no mail, token columns untouched", async () => {
    await mkUser("c@x.com", { token: "tok-keep", verifiedAt: new Date() });
    const res = await resend({ email: "c@x.com" });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ message: GENERIC_RESEND_MESSAGE });
    expect(mockSend).not.toHaveBeenCalled();
    const user = await prisma.user.findUnique({ where: { email: "c@x.com" } });
    expect(user!.verificationToken).toBe("tok-keep");
  });

  it("unknown email → same generic 200, no mail (no enumeration)", async () => {
    const res = await resend({ email: "ghost@x.com" });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ message: GENERIC_RESEND_MESSAGE });
    expect(mockSend).not.toHaveBeenCalled();
  });

  it("normalizes the input email before lookup", async () => {
    await mkUser("dave@x.com", { token: "tok-old", expiresAt: new Date(Date.now() + 1000) });
    const res = await resend({ email: "  DAVE@X.com " });
    expect(res.status).toBe(200);
    expect(mockSend).toHaveBeenCalledTimes(1);
  });

  it("still returns generic 200 when the SMTP send fails", async () => {
    await mkUser("b@x.com", { token: "tok-old", expiresAt: new Date(Date.now() + 1000) });
    mockSend.mockRejectedValueOnce(new Error("smtp down"));
    const res = await resend({ email: "b@x.com" });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ message: GENERIC_RESEND_MESSAGE });
  });

  it("invalid email shape → 400 VALIDATION", async () => {
    const res = await resend({ email: "nope" });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION");
  });
});
