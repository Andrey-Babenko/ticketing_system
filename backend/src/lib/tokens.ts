import { createHash, randomBytes } from "node:crypto";

// 32 random bytes, base64url → 43-char URL-safe opaque string.
// Used for verification tokens (ADR-9), session ids (ADR-8), and reset tokens (ADR-17).
export function generateToken(): string {
  return randomBytes(32).toString("base64url");
}

// ADR-17: reset tokens grant account takeover (unlike verification tokens), so only the
// hash is persisted — a leaked DB read can't be replayed. Plain SHA-256, not Argon2: the
// input is already 32 random bytes, so there's nothing to slow down a brute-force of.
export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}
