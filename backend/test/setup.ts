import { beforeEach, afterAll } from "vitest";
import { prisma } from "../src/lib/prisma.js";

// Explicit list — never touch _prisma_migrations. Quoted: Prisma uses PascalCase table names.
const TABLES = ['"Comment"', '"Ticket"', '"Epic"', '"Team"', '"Session"', '"User"'];

beforeEach(async () => {
  await prisma.$executeRawUnsafe(
    `TRUNCATE TABLE ${TABLES.join(", ")} RESTART IDENTITY CASCADE`
  );
});

afterAll(async () => {
  await prisma.$disconnect();
});
