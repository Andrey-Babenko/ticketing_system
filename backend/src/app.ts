import express from "express";
import cookieParser from "cookie-parser";
import { prisma } from "./lib/prisma.js";
import { auth } from "./middleware/auth.js";
import { notFoundHandler, errorHandler } from "./middleware/errors.js";
import { authRouter } from "./routes/auth.js";
import { teamsRouter } from "./routes/teams.js";
import { epicsRouter } from "./routes/epics.js";
import { ticketsRouter } from "./routes/tickets.js";

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

app.use("/api/auth", authRouter);
app.use("/api/teams", teamsRouter);
app.use("/api/epics", epicsRouter);
app.use("/api/tickets", ticketsRouter);

app.use(notFoundHandler);
app.use(errorHandler);
