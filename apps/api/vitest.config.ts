import { defineConfig } from "vitest/config";

const TEST_DATABASE_URL =
  process.env.TEST_DATABASE_URL ?? "postgresql://kanban:kanban@localhost:5434/kanban_test?schema=public";

export default defineConfig({
  test: {
    environment: "node",
    globalSetup: ["./test/globalSetup.ts"],
    env: { DATABASE_URL: TEST_DATABASE_URL, NODE_ENV: "test" },
    // Tests share one real database; run files serially.
    fileParallelism: false,
    testTimeout: 15_000,
  },
});
