import { prisma } from "../src/lib/prisma.js";

// Creates a verified user with a live session directly in the DB (auth flow itself is
// covered by auth.*.test.ts) and returns the Cookie header value for supertest requests.
export async function authedCookie(email = "tester@example.com"): Promise<string> {
  const user = await prisma.user.create({
    data: { email, passwordHash: "x", emailVerifiedAt: new Date() },
  });
  const sid = `test-session-${user.id}`;
  await prisma.session.create({
    data: { id: sid, userId: user.id, expiresAt: new Date(Date.now() + 7 * 86400000) },
  });
  return `sid=${sid}`;
}
