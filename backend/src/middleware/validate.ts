import type { Request, Response, NextFunction } from "express";
import type { z } from "zod";
import { sendError } from "./errors.js";

// Zod v4 note: schema.safeParse(...).error.issues[] has stable {path, message} shape;
// z.email() is top-level (string().email() is deprecated) — relevant to later slices.
export const validate = (schema: z.ZodType) =>
  (req: Request, res: Response, next: NextFunction) => {
    const result = schema.safeParse(req.body);
    if (!result.success) {
      const issue = result.error.issues[0];
      return sendError(
        res,
        400,
        "VALIDATION",
        issue.message,
        issue.path.length ? issue.path.join(".") : undefined
      );
    }
    req.body = result.data;
    next();
  };
