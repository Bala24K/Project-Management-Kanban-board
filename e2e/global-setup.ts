import { PrismaClient } from "@prisma/client";

const url = process.env.E2E_DATABASE_URL ?? "postgresql://kanban:kanban@localhost:5434/kanban_e2e?schema=public";

/**
 * Empty the e2e database (skipped when testing a deployed URL).
 * Migrations run in the webServer command, which Playwright starts first.
 */
export default async function globalSetup() {
  if (process.env.E2E_BASE_URL) return;
  const prisma = new PrismaClient({ datasourceUrl: url });
  await prisma.task.deleteMany();
  await prisma.$disconnect();
}
