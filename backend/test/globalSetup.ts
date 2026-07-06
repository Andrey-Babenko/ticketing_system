import { execSync } from "node:child_process";
import { PrismaClient } from "@prisma/client";

const ADMIN_URL = "postgresql://app:app@localhost:5432/ticketing";
export const TEST_DATABASE_URL = "postgresql://app:app@localhost:5432/ticketing_test";

export default async function setup() {
  const admin = new PrismaClient({ datasourceUrl: ADMIN_URL });
  try {
    const exists = await admin.$queryRawUnsafe<{ exists: boolean }[]>(
      "SELECT EXISTS(SELECT 1 FROM pg_database WHERE datname = 'ticketing_test') AS exists"
    );
    if (!exists[0]?.exists) {
      await admin.$executeRawUnsafe("CREATE DATABASE ticketing_test");
    }
  } catch (e) {
    throw new Error(
      `Could not prepare test database — is the db container up? Run: docker compose up -d db\n${e}`
    );
  } finally {
    await admin.$disconnect();
  }

  execSync("npx prisma migrate deploy", {
    cwd: new URL("..", import.meta.url).pathname,
    env: { ...process.env, DATABASE_URL: TEST_DATABASE_URL },
    stdio: "inherit",
  });
}
