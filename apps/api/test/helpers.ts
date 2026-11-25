import { PrismaClient } from "@prisma/client";
import type { Express } from "express";
import type { BoardResponse, Status, Task } from "@kanban/shared";
import request from "supertest";
import { createApp } from "../src/app.js";
import { EventHub } from "../src/events/hub.js";
import { loadConfig, type Config } from "../src/lib/config.js";
import { TaskService } from "../src/services/taskService.js";

export const prisma = new PrismaClient();

export async function resetDb(): Promise<void> {
  await prisma.task.deleteMany();
  await prisma.board.upsert({
    where: { id: "main" },
    create: { id: "main", title: "Product Roadmap", revision: 0 },
    update: { revision: 0 },
  });
}

export function makeApp(overrides: Partial<Config> = {}): {
  app: Express;
  hub: EventHub;
  service: TaskService;
} {
  const config: Config = {
    ...loadConfig({}),
    failureSimulation: true,
    failureRate: 0,
    latencyMs: 0,
    corsOrigins: [],
    webDist: "__none__",
    ...overrides,
  };
  const service = new TaskService(prisma);
  const hub = new EventHub({ heartbeatMs: 60_000 });
  return { app: createApp({ service, hub, config }), hub, service };
}

export async function getBoard(app: Express): Promise<BoardResponse> {
  const res = await request(app).get("/api/board").expect(200);
  return res.body as BoardResponse;
}

/** Ordered titles per column, read straight from the database. */
export async function columnTitles(status: Status): Promise<string[]> {
  const rows = await prisma.task.findMany({ where: { status }, orderBy: { position: "asc" } });
  return rows.map((r) => r.title);
}

/** Assert positions in every column are exactly 0..n-1. */
export async function expectDensePositions(): Promise<void> {
  const rows = await prisma.task.findMany({ orderBy: [{ status: "asc" }, { position: "asc" }] });
  const byStatus = new Map<string, number[]>();
  for (const r of rows) byStatus.set(r.status, [...(byStatus.get(r.status) ?? []), r.position]);
  for (const [status, positions] of byStatus) {
    const expected = positions.map((_, i) => i);
    if (JSON.stringify(positions) !== JSON.stringify(expected)) {
      throw new Error(`Positions in ${status} are not dense: ${JSON.stringify(positions)}`);
    }
  }
}

export async function createTask(app: Express, body: Record<string, unknown>): Promise<Task> {
  const res = await request(app).post("/api/tasks").send(body).expect(201);
  return res.body.task as Task;
}
