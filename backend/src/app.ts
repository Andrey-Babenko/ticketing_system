import express from "express";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

export const app = express();
app.use(express.json());

app.get("/api/health", async (_req, res) => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    res.status(200).json({ status: "ok" });
  } catch {
    res.status(503).json({ status: "error" });
  }
});
