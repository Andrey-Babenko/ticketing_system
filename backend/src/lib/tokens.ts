import { randomBytes } from "node:crypto";

// 32 random bytes, base64url → 43-char URL-safe opaque string.
// Used for verification tokens (ADR-9) and session ids (ADR-8).
export function generateToken(): string {
  return randomBytes(32).toString("base64url");
}
