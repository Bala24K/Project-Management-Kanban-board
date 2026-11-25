import { PrismaClient } from "@prisma/client";
import type { CreateTaskInput } from "@kanban/shared";
import { TaskService } from "../src/services/taskService.js";

/** Seeds a small demo board. Only runs when the board has no tasks (use --force to wipe). */
const prisma = new PrismaClient();
const service = new TaskService(prisma);

const tasks: CreateTaskInput[] = [
  { title: "Research competitor onboarding flows", description: "Collect screenshots of 5 competitors and summarise patterns.", priority: "low", assignee: "Priya", status: "backlog" },
  { title: "Add CSV export to reports", description: "Users want to export the monthly report table.", priority: "medium", assignee: "Alex", status: "backlog" },
  { title: "Dark mode for settings page", description: "", priority: "low", assignee: "", status: "backlog" },
  { title: "Payment retry for failed invoices", description: "Retry card payments 3 times over 7 days before marking an invoice as failed.", priority: "high", assignee: "Alex", status: "todo" },
  { title: "Write API docs for webhooks", description: "Document payload shapes and signature verification.", priority: "medium", assignee: "Sam", status: "todo" },
  { title: "Fix timezone bug in due dates", description: "Due dates shift by one day for users west of UTC.", priority: "high", assignee: "Priya", status: "in_progress" },
  { title: "Migrate image uploads to S3", description: "Move from local disk storage to S3 with signed URLs.", priority: "medium", assignee: "Sam", status: "in_progress" },
  { title: "Set up error monitoring", description: "Wire up alerting for 5xx spikes.", priority: "medium", assignee: "Alex", status: "done" },
  { title: "Payment page copy review", description: "Legal reviewed the new pricing copy.", priority: "low", assignee: "Priya", status: "done" },
];

async function main() {
  const force = process.argv.includes("--force");
  const count = await prisma.task.count();
  if (count > 0 && !force) {
    console.log(`[seed] board already has ${count} tasks; skipping (use --force to reset)`);
    return;
  }
  if (force) await prisma.task.deleteMany();
  await service.ensureBoard();
  for (const t of tasks) await service.create(t);
  console.log(`[seed] created ${tasks.length} tasks`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
