import { afterAll, beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import { STATUSES } from "@kanban/shared";
import { columnTitles, createTask, expectDensePositions, getBoard, makeApp, prisma, resetDb } from "./helpers.js";

const { app } = makeApp();

beforeEach(resetDb);
afterAll(() => prisma.$disconnect());

describe("GET /api/board", () => {
  it("returns an empty board with revision on a fresh database", async () => {
    const board = await getBoard(app);
    expect(board.board).toEqual({ id: "main", title: "Product Roadmap" });
    expect(board.tasks).toEqual([]);
    expect(board.revision).toBe(0);
  });

  it("returns persisted tasks with the full Task shape", async () => {
    await createTask(app, { title: "A", status: "todo", priority: "high", assignee: "Alex" });
    const board = await getBoard(app);
    expect(board.tasks).toHaveLength(1);
    const t = board.tasks[0]!;
    expect(t).toMatchObject({ title: "A", status: "todo", priority: "high", assignee: "Alex", position: 0, description: "" });
    expect(typeof t.id).toBe("string");
    expect(new Date(t.updatedAt).toISOString()).toBe(t.updatedAt);
    expect(board.revision).toBe(1);
  });
});

describe("POST /api/tasks", () => {
  it("creates a task (201) with defaults and appends to the column", async () => {
    const a = await createTask(app, { title: "First" });
    const b = await createTask(app, { title: "Second" });
    expect(a).toMatchObject({ status: "backlog", priority: "medium", position: 0, revision: 1 });
    expect(b).toMatchObject({ position: 1, revision: 2 });
    expect(await columnTitles("backlog")).toEqual(["First", "Second"]);
  });

  it("accepts a client-generated id and an insertion index", async () => {
    await createTask(app, { title: "A" });
    await createTask(app, { title: "B" });
    const id = "6f1c1e9c-2b8b-4a59-9f43-1c1f7d1e0a01";
    const res = await request(app).post("/api/tasks").send({ id, title: "Inserted", position: 1 }).expect(201);
    expect(res.body.task.id).toBe(id);
    expect(res.body.order.backlog).toHaveLength(3);
    expect(await columnTitles("backlog")).toEqual(["A", "Inserted", "B"]);
    await expectDensePositions();
  });

  it("rejects a duplicate client id with 409", async () => {
    const id = "6f1c1e9c-2b8b-4a59-9f43-1c1f7d1e0a02";
    await request(app).post("/api/tasks").send({ id, title: "A" }).expect(201);
    const res = await request(app).post("/api/tasks").send({ id, title: "B" }).expect(409);
    expect(res.body.error.code).toBe("CONFLICT");
  });

  it.each([
    [{}, "title"],
    [{ title: "   " }, "title"],
    [{ title: "x", priority: "urgent" }, "priority"],
    [{ title: "x", status: "archived" }, "status"],
    [{ title: "x", position: -1 }, "position"],
    [{ title: "x", unknown: true }, "unknown"],
    [{ title: "x".repeat(201) }, "title"],
  ])("rejects invalid payload %j with 400", async (body, field) => {
    const res = await request(app).post("/api/tasks").send(body).expect(400);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
    expect(JSON.stringify(res.body.error)).toContain(field);
    expect(await prisma.task.count()).toBe(0);
  });

  it("rejects malformed JSON with 400", async () => {
    const res = await request(app).post("/api/tasks").set("content-type", "application/json").send("{bad").expect(400);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
  });
});

describe("PATCH /api/tasks/:id", () => {
  it("edits fields and bumps revision/updatedAt", async () => {
    const t = await createTask(app, { title: "Old" });
    await new Promise((r) => setTimeout(r, 5));
    const res = await request(app)
      .patch(`/api/tasks/${t.id}`)
      .send({ title: "New", description: "Desc", priority: "high", assignee: "Sam" })
      .expect(200);
    expect(res.body.task).toMatchObject({ title: "New", description: "Desc", priority: "high", assignee: "Sam" });
    expect(res.body.task.revision).toBeGreaterThan(t.revision);
    expect(Date.parse(res.body.task.updatedAt)).toBeGreaterThan(Date.parse(t.updatedAt));
    const db = await prisma.task.findUniqueOrThrow({ where: { id: t.id } });
    expect(db.title).toBe("New");
  });

  it("returns 404 for a missing or malformed id", async () => {
    await request(app).patch("/api/tasks/00000000-0000-4000-8000-000000000000").send({ title: "x" }).expect(404);
    const res = await request(app).patch("/api/tasks/not-a-uuid").send({ title: "x" }).expect(404);
    expect(res.body.error.code).toBe("NOT_FOUND");
  });

  it("rejects an empty or invalid update with 400", async () => {
    const t = await createTask(app, { title: "A" });
    await request(app).patch(`/api/tasks/${t.id}`).send({}).expect(400);
    await request(app).patch(`/api/tasks/${t.id}`).send({ priority: "nope" }).expect(400);
    await request(app).patch(`/api/tasks/${t.id}`).send({ revision: 5 }).expect(400);
  });

  it("reorders within a column and persists dense positions", async () => {
    for (const title of ["A", "B", "C", "D"]) await createTask(app, { title, status: "todo" });
    const d = (await getBoard(app)).tasks.find((t) => t.title === "D")!;
    const res = await request(app).patch(`/api/tasks/${d.id}`).send({ position: 1 }).expect(200);
    expect(res.body.task.position).toBe(1);
    expect(Object.keys(res.body.order)).toEqual(["todo"]);
    expect(await columnTitles("todo")).toEqual(["A", "D", "B", "C"]);

    const a = (await getBoard(app)).tasks.find((t) => t.title === "A")!;
    await request(app).patch(`/api/tasks/${a.id}`).send({ position: 3 }).expect(200);
    expect(await columnTitles("todo")).toEqual(["D", "B", "C", "A"]);
    await expectDensePositions();
  });

  it("moves across columns, renumbering both columns", async () => {
    for (const title of ["A", "B", "C"]) await createTask(app, { title, status: "todo" });
    for (const title of ["X", "Y"]) await createTask(app, { title, status: "done" });
    const b = (await getBoard(app)).tasks.find((t) => t.title === "B")!;
    const res = await request(app).patch(`/api/tasks/${b.id}`).send({ status: "done", position: 1 }).expect(200);
    expect(res.body.task).toMatchObject({ status: "done", position: 1 });
    expect(await columnTitles("todo")).toEqual(["A", "C"]);
    expect(await columnTitles("done")).toEqual(["X", "B", "Y"]);
    expect(res.body.order.todo).toHaveLength(2);
    expect(res.body.order.done).toHaveLength(3);
    await expectDensePositions();
  });

  it("appends to the end when status changes without a position", async () => {
    await createTask(app, { title: "X", status: "done" });
    const a = await createTask(app, { title: "A", status: "todo" });
    await request(app).patch(`/api/tasks/${a.id}`).send({ status: "done" }).expect(200);
    expect(await columnTitles("done")).toEqual(["X", "A"]);
  });

  it("clamps out-of-range positions", async () => {
    const a = await createTask(app, { title: "A" });
    await createTask(app, { title: "B" });
    await request(app).patch(`/api/tasks/${a.id}`).send({ position: 999 }).expect(200);
    expect(await columnTitles("backlog")).toEqual(["B", "A"]);
  });

  it("does not bump revision/updatedAt of tasks that were only renumbered", async () => {
    const a = await createTask(app, { title: "A" });
    const b = await createTask(app, { title: "B" });
    await request(app).patch(`/api/tasks/${b.id}`).send({ position: 0 }).expect(200);
    const dbA = await prisma.task.findUniqueOrThrow({ where: { id: a.id } });
    expect(dbA.position).toBe(1);
    expect(dbA.revision).toBe(a.revision);
    expect(dbA.updatedAt.toISOString()).toBe(a.updatedAt);
  });

  it("keeps positions consistent under concurrent moves", async () => {
    for (let i = 0; i < 8; i++) await createTask(app, { title: `T${i}`, status: STATUSES[i % 4] });
    const tasks = (await getBoard(app)).tasks;
    await Promise.all(
      tasks.map((t, i) =>
        request(app)
          .patch(`/api/tasks/${t.id}`)
          .send({ status: STATUSES[(i + 1) % 4], position: i % 3 })
          .expect(200),
      ),
    );
    await expectDensePositions();
    expect(await prisma.task.count()).toBe(8);
    expect((await getBoard(app)).revision).toBe(16);
  });

  describe("field-level compare-and-set", () => {
    it("rejects with 409 when an edited field was changed by someone else", async () => {
      const t = await createTask(app, { title: "Original", priority: "low" });
      await request(app).patch(`/api/tasks/${t.id}`).send({ title: "Theirs" }).expect(200);
      const res = await request(app)
        .patch(`/api/tasks/${t.id}`)
        .send({ title: "Mine", expected: { title: "Original" } })
        .expect(409);
      expect(res.body.error.code).toBe("CONFLICT");
      expect(res.body.error.details.fields).toEqual(["title"]);
      expect(res.body.error.current.title).toBe("Theirs");
      expect((await prisma.task.findUniqueOrThrow({ where: { id: t.id } })).title).toBe("Theirs");
    });

    it("merges concurrent edits of different fields", async () => {
      const t = await createTask(app, { title: "Original", priority: "low" });
      await request(app).patch(`/api/tasks/${t.id}`).send({ title: "Theirs" }).expect(200);
      const res = await request(app)
        .patch(`/api/tasks/${t.id}`)
        .send({ priority: "high", expected: { priority: "low" } })
        .expect(200);
      expect(res.body.task).toMatchObject({ title: "Theirs", priority: "high" });
    });

    it("accepts when the other change already matches the requested value", async () => {
      const t = await createTask(app, { title: "Original" });
      await request(app).patch(`/api/tasks/${t.id}`).send({ title: "Same" }).expect(200);
      await request(app).patch(`/api/tasks/${t.id}`).send({ title: "Same", expected: { title: "Original" } }).expect(200);
    });

    it("does not consume a revision on conflict", async () => {
      const t = await createTask(app, { title: "Original" });
      await request(app).patch(`/api/tasks/${t.id}`).send({ title: "Theirs" }).expect(200);
      const before = (await getBoard(app)).revision;
      await request(app).patch(`/api/tasks/${t.id}`).send({ title: "Mine", expected: { title: "Original" } }).expect(409);
      expect((await getBoard(app)).revision).toBe(before);
    });
  });
});

describe("DELETE /api/tasks/:id", () => {
  it("deletes (204) and renumbers the column", async () => {
    for (const title of ["A", "B", "C"]) await createTask(app, { title });
    const b = (await getBoard(app)).tasks.find((t) => t.title === "B")!;
    const res = await request(app).delete(`/api/tasks/${b.id}`).expect(204);
    expect(res.text).toBe("");
    expect(await columnTitles("backlog")).toEqual(["A", "C"]);
    await expectDensePositions();
  });

  it("returns 404 for a missing task, and on a second delete", async () => {
    const t = await createTask(app, { title: "A" });
    await request(app).delete(`/api/tasks/${t.id}`).expect(204);
    const res = await request(app).delete(`/api/tasks/${t.id}`).expect(404);
    expect(res.body.error.code).toBe("NOT_FOUND");
  });
});

describe("failure simulation", () => {
  it("fails a write with 503 before touching the database when the header is set", async () => {
    const res = await request(app).post("/api/tasks").set("x-simulate-failure", "1").send({ title: "A" }).expect(503);
    expect(res.body.error.code).toBe("SIMULATED_FAILURE");
    expect(await prisma.task.count()).toBe(0);
  });

  it("ignores the header when simulation is disabled", async () => {
    const { app: prodLike } = makeApp({ failureSimulation: false });
    await request(prodLike).post("/api/tasks").set("x-simulate-failure", "1").send({ title: "A" }).expect(201);
  });

  it("never fails reads", async () => {
    await request(app).get("/api/board").set("x-simulate-failure", "1").expect(200);
  });
});

describe("unknown routes", () => {
  it("returns a JSON 404", async () => {
    const res = await request(app).get("/api/nope").expect(404);
    expect(res.body.error.code).toBe("NOT_FOUND");
  });
});
