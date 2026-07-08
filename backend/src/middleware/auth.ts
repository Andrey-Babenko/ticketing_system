import type { Request, Response, NextFunction } from "express";
import { prisma } from "../lib/prisma.js";
import { sendError } from "./errors.js";

// §3 — these screens/endpoints work without authentication.
const PUBLIC_PATHS = new Set([
  "/api/health",
  "/api/auth/signup",
  "/api/auth/login",
  "/api/auth/verify",
  "/api/auth/resend-verification",
  "/api/auth/request-password-reset",
  "/api/auth/reset-password",
]);

export const SESSION_LIFETIME_MS = 7 * 24 * 60 * 60 * 1000; // 7 days (ADR-8)
const EXTEND_THRESHOLD_MS = SESSION_LIFETIME_MS - 24 * 60 * 60 * 1000; // extend once >24h consumed

export async function auth(req: Request, res: Response, next: NextFunction) {
  if (PUBLIC_PATHS.has(req.path)) return next();

  const sid = req.cookies?.sid;
  if (!sid) return sendError(res, 401, "UNAUTHENTICATED", "Authentication required");

  const session = await prisma.session.findUnique({
    where: { id: sid },
    include: { user: true },
  });
  if (!session) return sendError(res, 401, "UNAUTHENTICATED", "Authentication required");

  if (session.expiresAt <= new Date()) {
    await prisma.session.delete({ where: { id: sid } }).catch(() => {});
    return sendError(res, 401, "UNAUTHENTICATED", "Session expired");
  }

  const remainingMs = session.expiresAt.getTime() - Date.now();
  if (remainingMs < EXTEND_THRESHOLD_MS) {
    await prisma.session.update({
      where: { id: sid },
      data: { expiresAt: new Date(Date.now() + SESSION_LIFETIME_MS) },
    });
  }

  req.user = { id: session.user.id, email: session.user.email };
  next();
}
