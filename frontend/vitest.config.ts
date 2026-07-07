import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // Pure-function unit tests only (boardFilters, boardDnd) — no DOM needed.
    environment: "node",
  },
});
