import { z } from "zod";

// §4: non-empty after trimming; 200 is a guardrail, not an advertised limit.
export const teamWriteSchema = z.object({
  name: z.string().trim().min(1, "Team name is required").max(200),
});
