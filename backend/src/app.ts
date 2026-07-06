import express from "express";
import cookieParser from "cookie-parser";
import { prisma } from "./lib/prisma.js";
import { auth } from "./middleware/auth.js";
import { notFoundHandler, errorHandler } from "./middleware/errors.js";

export const app = express();

app.use(express.json());
app.use(cookieParser());
app.use(auth);

app.get("/api/health", async (_req, res) => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    res.status(200).json({ status: "ok" });
  } catch {
    res.status(503).json({ status: "error" });
  }
});

app.get("/api/auth/me", (req, res) => {
  res.status(200).json(req.user);
});

app.use(notFoundHandler);
app.use(errorHandler);
