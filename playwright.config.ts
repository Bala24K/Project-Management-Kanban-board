import { defineConfig, devices } from "@playwright/test";

/**
 * End-to-end tests run against the REAL API + PostgreSQL (a dedicated e2e
 * database), with the production build of the frontend served by the API.
 */
const PORT = Number(process.env.E2E_PORT ?? 4100);
export const E2E_DATABASE_URL =
  process.env.E2E_DATABASE_URL ?? "postgresql://kanban:kanban@localhost:5434/kanban_e2e?schema=public";

export default defineConfig({
  testDir: "./e2e",
  globalSetup: "./e2e/global-setup.ts",
  fullyParallel: false,
  workers: 1,
  timeout: 30_000,
  expect: { timeout: 5_000 },
  reporter: [["list"]],
  use: {
    baseURL: process.env.E2E_BASE_URL ?? `http://localhost:${PORT}`,
    trace: "retain-on-failure",
    ...devices["Desktop Chrome"],
    viewport: { width: 1440, height: 900 },
  },
  webServer: process.env.E2E_BASE_URL
    ? undefined
    : {
        command: "npm run db:deploy -w @kanban/api && npm run build -w @kanban/web && npx tsx apps/api/src/server.ts",
        url: `http://localhost:${PORT}/api/health`,
        reuseExistingServer: false,
        timeout: 120_000,
        env: {
          DATABASE_URL: E2E_DATABASE_URL,
          PORT: String(PORT),
          FAILURE_SIMULATION: "true",
        },
      },
});
