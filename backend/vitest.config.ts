import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globalSetup: ["./test/globalSetup.ts"],
    setupFiles: ["./test/setup.ts"],
    // One shared Postgres DB across the suite — files must not interleave TRUNCATEs.
    fileParallelism: false,
    testTimeout: 15000,
    env: {
      DATABASE_URL: "postgresql://app:app@localhost:5432/ticketing_test",
    },
  },
});
