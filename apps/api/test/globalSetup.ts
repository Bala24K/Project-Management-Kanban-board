import { execSync } from "node:child_process";

/** Apply migrations to the (real) test database before any test runs. */
export default function setup() {
  const url = process.env.TEST_DATABASE_URL ?? "postgresql://kanban:kanban@localhost:5434/kanban_test?schema=public";
  execSync("npx prisma migrate deploy", {
    stdio: "inherit",
    env: { ...process.env, DATABASE_URL: url },
  });
}
