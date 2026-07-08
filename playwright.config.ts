import { defineConfig, devices } from "@playwright/test";

// Targets the compose stack at :8080 — the nginx prod build QA actually runs (spec §2),
// not the Vite dev server. §11's browser requirement is "Chrome, Edge, or Firefox" — the
// "or" makes one sufficient; add more `projects` entries below if broader coverage is
// ever wanted (Firefox: devices["Desktop Firefox"], WebKit: devices["Desktop Safari"]).
export default defineConfig({
  testDir: "./e2e",
  globalSetup: "./e2e/global-setup.ts",
  fullyParallel: true,
  retries: 0, // flake must surface, not hide (interview decision)
  reporter: "list",
  use: {
    baseURL: "http://localhost:8080",
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    headless: false, // solo local project, no CI — default to watching it run
  },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
    // Angular twin (ADR-18) — same suite, second baseURL. Gated behind E2E_ANGULAR
    // while the twin is mid-build (Slice 9) so a plain `npx playwright test` stays
    // green; S9.7 removes the gate once the twin has full parity.
    ...(process.env.E2E_ANGULAR
      ? [
          {
            name: "angular",
            use: { ...devices["Desktop Chrome"], baseURL: "http://localhost:8081" },
          },
        ]
      : []),
  ],
});
