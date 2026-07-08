import { z } from "zod";

// ADR-12: every email input is trimmed + lowercased BEFORE validation/comparison.
const email = z.string().trim().toLowerCase().pipe(z.email());

// §3 + openapi Credentials: 8..128 chars, NEVER trimmed or normalized.
const password = z
  .string()
  .min(8, "Password must be at least 8 characters")
  .max(128, "Password must be at most 128 characters");

export const credentialsSchema = z.object({ email, password }); // signup + login
export const verifySchema = z.object({ token: z.string().min(1) });
export const resendSchema = z.object({ email });

// S8.4/ADR-17
export const requestResetSchema = z.object({ email });
export const resetPasswordSchema = z.object({ token: z.string().min(1), password });
