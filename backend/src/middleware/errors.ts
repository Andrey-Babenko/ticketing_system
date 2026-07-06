import type { Request, Response, NextFunction } from "express";

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public field?: string
  ) {
    super(message);
  }
}

export function sendError(
  res: Response,
  status: number,
  code: string,
  message: string,
  field?: string
) {
  res.status(status).json({ error: { code, message, ...(field && { field }) } });
}

export function notFoundHandler(_req: Request, res: Response) {
  sendError(res, 404, "NOT_FOUND", "Not found");
}

export function errorHandler(
  err: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction
) {
  if (err instanceof ApiError) {
    return sendError(res, err.status, err.code, err.message, err.field);
  }
  // body-parser JSON syntax error
  if (err && typeof err === "object" && (err as any).type === "entity.parse.failed") {
    return sendError(res, 400, "VALIDATION", "Malformed JSON body");
  }
  console.error(err);
  return sendError(res, 500, "INTERNAL", "Internal server error");
}
