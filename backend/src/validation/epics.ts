import { z } from "zod";
import { INT4_MAX } from "../lib/ids.js";

// §5: title non-empty after trimming; 200/50000 are guardrails, not advertised limits.
const title = z.string().trim().min(1, "Epic title is required").max(200);

// Wrapper order matters: optional → nullable → effects. An ABSENT key short-circuits at
// optional() (transform never runs, stays undefined = "keep current" on PATCH); an explicit
// null short-circuits at nullable() (= "clear"); a string is trimmed with empty → null.
const description = z
  .string()
  .trim()
  .max(50000)
  .transform((t) => (t === "" ? null : t))
  .nullable()
  .optional();

export const epicCreateSchema = z.object({
  // INT4_MAX cap: beyond-range ids would make Prisma throw a non-Known error → 500.
  teamId: z.number().int().positive().max(INT4_MAX),
  title,
  description,
});

// §5: the team is immutable after creation. .strict() makes an attempted team move (or any
// unknown key) a loud 400 instead of a silently-stripped no-op (interview decision, Slice 4).
export const epicUpdateSchema = z
  .object({
    title: title.optional(),
    description,
  })
  .strict();
