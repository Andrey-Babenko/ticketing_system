import { Router } from "express";
import argon2 from "argon2";
import { Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma.js";
import { generateToken } from "../lib/tokens.js";
import { sendVerificationEmail } from "../lib/mailer.js";
import { validate } from "../middleware/validate.js";
import { ApiError } from "../middleware/errors.js";
import { credentialsSchema, verifySchema, resendSchema } from "../validation/auth.js";

const VERIFICATION_TTL_MS = 24 * 60 * 60 * 1000; // §3: tokens expire after 24 hours

export const authRouter = Router();

authRouter.post("/signup", validate(credentialsSchema), async (req, res) => {
  const { email, password } = req.body as { email: string; password: string };

  // Friendly pre-check; the unique constraint below is the race-safe backstop (ADR-12).
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) throw new ApiError(409, "EMAIL_TAKEN", "Email already registered", "email");

  // argon2id with library defaults: m=64MiB, t=3, p=4 (§3; PHC string self-describes).
  const passwordHash = await argon2.hash(password);

  let user;
  try {
    user = await prisma.user.create({
      data: {
        email,
        passwordHash,
        verificationToken: generateToken(),
        verificationTokenExpiresAt: new Date(Date.now() + VERIFICATION_TTL_MS),
      },
    });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      throw new ApiError(409, "EMAIL_TAKEN", "Email already registered", "email");
    }
    throw e;
  }

  // Contract: 201 even if the mail fails — resend is the recovery path.
  try {
    await sendVerificationEmail(user.email, user.verificationToken!);
  } catch (e) {
    console.error("signup: verification mail failed:", e);
  }

  res.status(201).json({ id: user.id, email: user.email });
});

authRouter.post("/verify", validate(verifySchema), async (req, res) => {
  const { token } = req.body as { token: string };

  // ADR-9 resolution order: verified-check BEFORE expiry-check, so a stale link on a
  // verified account stays success-flavored (double-click / StrictMode safe).
  const user = await prisma.user.findUnique({ where: { verificationToken: token } });
  if (!user) throw new ApiError(400, "TOKEN_INVALID", "Verification link is invalid");
  if (user.emailVerifiedAt) return res.json({ status: "already_verified" });
  if (user.verificationTokenExpiresAt! <= new Date()) {
    throw new ApiError(400, "TOKEN_EXPIRED", "Verification link has expired");
  }

  await prisma.user.update({
    where: { id: user.id },
    data: { emailVerifiedAt: new Date() },
  });
  res.json({ status: "verified" }); // token kept — re-use is a no-op (ADR-9)
});

authRouter.post("/resend-verification", validate(resendSchema), async (req, res) => {
  const { email } = req.body as { email: string };

  // Reissue only for existing-unverified accounts; the response never varies (no enumeration).
  const user = await prisma.user.findUnique({ where: { email } });
  if (user && !user.emailVerifiedAt) {
    const token = generateToken(); // overwrite = older tokens dead by construction (§3, ADR-9)
    await prisma.user.update({
      where: { id: user.id },
      data: {
        verificationToken: token,
        verificationTokenExpiresAt: new Date(Date.now() + VERIFICATION_TTL_MS),
      },
    });
    try {
      await sendVerificationEmail(user.email, token);
    } catch (e) {
      console.error("resend: verification mail failed:", e);
    }
  }

  res.json({
    message:
      "If an unverified account exists for this address, a new verification email has been sent.",
  });
});
