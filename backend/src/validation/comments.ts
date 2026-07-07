import { z } from "zod";

// §7: non-empty after trim; .strict() per the Slice-5 write-schema convention
// (a client sending an `author` field must be told, not silently ignored).
export const commentCreateSchema = z
  .object({
    body: z.string().trim().min(1, "Comment body is required").max(50000),
  })
  .strict();
