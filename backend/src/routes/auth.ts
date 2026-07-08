import { Router } from "express";
import argon2 from "argon2";
import { Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma.js";
import { generateToken, hashToken } from "../lib/tokens.js";
import { sendVerificationEmail, sendPasswordResetEmail } from "../lib/mailer.js";
import { validate } from "../middleware/validate.js";
import { ApiError } from "../middleware/errors.js";
import { SESSION_LIFETIME_MS } from "../middleware/auth.js";
import {
  credentialsSchema,
  verifySchema,
  resendSchema,
  requestResetSchema,
  resetPasswordSchema,
} from "../validation/auth.js";

const VERIFICATION_TTL_MS = 24 * 60 * 60 * 1000; // §3: tokens expire after 24 hours
const RESET_TTL_MS = 60 * 60 * 1000; // ADR-17: 1h — shorter than verify's 24h (takeover risk)

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

authRouter.post(
  "/request-password-reset",
  validate(requestResetSchema),
  async (req, res) => {
    const { email } = req.body as { email: string };

    // ADR-17: reset mail goes only to existing, VERIFIED accounts — unverified users'
    // path stays resend-verification, keeping the two token flows orthogonal. Response
    // never varies (no enumeration), same as resend-verification.
    const user = await prisma.user.findUnique({ where: { email } });
    if (user && user.emailVerifiedAt) {
      const token = generateToken(); // overwrite = older tokens dead by construction
      await prisma.user.update({
        where: { id: user.id },
        data: {
          resetTokenHash: hashToken(token),
          resetTokenExpiresAt: new Date(Date.now() + RESET_TTL_MS),
        },
      });
      try {
        await sendPasswordResetEmail(user.email, token);
      } catch (e) {
        console.error("request-password-reset: mail failed:", e);
      }
    }

    res.json({
      message: "If an account exists for this address, a password reset email has been sent.",
    });
  }
);

authRouter.post("/reset-password", validate(resetPasswordSchema), async (req, res) => {
  const { token, password } = req.body as { token: string; password: string };

  const user = await prisma.user.findUnique({ where: { resetTokenHash: hashToken(token) } });
  if (!user) throw new ApiError(400, "TOKEN_INVALID", "Reset link is invalid");
  if (user.resetTokenExpiresAt! <= new Date()) {
    throw new ApiError(400, "TOKEN_EXPIRED", "Reset link has expired");
  }

  const passwordHash = await argon2.hash(password);
  await prisma.$transaction([
    prisma.user.update({
      where: { id: user.id },
      data: { passwordHash, resetTokenHash: null, resetTokenExpiresAt: null },
    }),
    // ADR-17: a reset implies the old password may be compromised — revoke every
    // existing session, not just the one (if any) making this request.
    prisma.session.deleteMany({ where: { userId: user.id } }),
  ]);

  res.json({ message: "Password reset. You can log in with your new password now." });
});

authRouter.post("/login", validate(credentialsSchema), async (req, res) => {
  const { email, password } = req.body as { email: string; password: string };

  // ADR-3 ordering: password check BEFORE verification check, so a wrong password on an
  // unverified account yields the generic 401 and never leaks verification state.
  // (Unknown-email short-circuit skips the hash — a timing side-channel, out of scope here.)
  const user = await prisma.user.findUnique({ where: { email } });
  const ok = user !== null && (await argon2.verify(user.passwordHash, password));
  if (!ok) throw new ApiError(401, "INVALID_CREDENTIALS", "Wrong email or password");
  if (!user.emailVerifiedAt) {
    throw new ApiError(403, "EMAIL_NOT_VERIFIED", "Email not verified"); // NO session (ADR-3)
  }

  const sid = generateToken();
  await prisma.session.create({
    data: { id: sid, userId: user.id, expiresAt: new Date(Date.now() + SESSION_LIFETIME_MS) },
  });
  res.cookie("sid", sid, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_LIFETIME_MS,
    // secure: deliberately absent — localhost HTTP (ADR-1); flip when APP_BASE_URL is https.
  });
  res.json({ id: user.id, email: user.email });
});

authRouter.post("/logout", async (req, res) => {
  // Protected by the auth middleware; .catch covers a concurrent-logout race.
  await prisma.session.delete({ where: { id: req.cookies.sid } }).catch(() => {});
  res.clearCookie("sid", { httpOnly: true, sameSite: "lax", path: "/" });
  res.status(204).end();
});

authRouter.get("/me", (req, res) => {
  res.status(200).json(req.user);
});
