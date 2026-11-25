import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import request from "supertest";
import type { TaskEvent } from "@kanban/shared";
import { createTask, makeApp, prisma, resetDb } from "./helpers.js";
import { EventHub, frame } from "../src/events/hub.js";

type Frame = { event: string; id?: string; data: any };

/** Minimal SSE client over fetch, so tests exercise the real HTTP stream. */
async function openStream(base: string, opts: { clientId?: string; lastEventId?: number } = {}) {
  const ctrl = new AbortController();
  const qs = opts.clientId ? `?clientId=${opts.clientId}` : "";
  const res = await fetch(`${base}/api/events${qs}`, {
    signal: ctrl.signal,
    headers: opts.lastEventId !== undefined ? { "Last-Event-ID": String(opts.lastEventId) } : {},
  });
  const frames: Frame[] = [];
  const waiters: Array<() => void> = [];
  const reader = res.body!.getReader();
  const decoder = new TextDecoder();
  let buf = "";
  void (async () => {
    try {
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        let idx;
        while ((idx = buf.indexOf("\n\n")) >= 0) {
          const raw = buf.slice(0, idx);
          buf = buf.slice(idx + 2);
          const f: Partial<Frame> = {};
          for (const line of raw.split("\n")) {
            if (line.startsWith("event: ")) f.event = line.slice(7);
            else if (line.startsWith("id: ")) f.id = line.slice(4);
            else if (line.startsWith("data: ")) f.data = JSON.parse(line.slice(6));
          }
          if (f.event) {
            frames.push(f as Frame);
            waiters.splice(0).forEach((w) => w());
          }
        }
      }
    } catch {
      /* aborted */
    }
  })();

  async function waitFor(pred: (f: Frame) => boolean, timeoutMs = 3000): Promise<Frame> {
    const deadline = Date.now() + timeoutMs;
    for (;;) {
      const hit = frames.find(pred);
      if (hit) return hit;
      if (Date.now() > deadline) throw new Error(`Timed out; frames: ${frames.map((f) => f.event).join(",")}`);
      await new Promise<void>((r) => {
        waiters.push(r);
        setTimeout(r, 50);
      });
    }
  }

  return { res, frames, waitFor, close: () => ctrl.abort() };
}

describe("GET /api/events (real HTTP server + DB)", () => {
  let app: ReturnType<typeof makeApp>["app"];
  let hub: EventHub;
  let server: Server;
  let base: string;
  const streams: Array<{ close: () => void }> = [];

  beforeEach(async () => {
    await resetDb();
    ({ app, hub } = makeApp());
    server = app.listen(0);
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });
  afterEach(async () => {
    streams.splice(0).forEach((s) => s.close());
    await new Promise((r) => setTimeout(r, 50));
    server.closeAllConnections();
    await new Promise((r) => server.close(r));
  });
  afterAll(() => prisma.$disconnect());

  it("sends SSE headers and a hello event with the current revision", async () => {
    const s = await openStream(base, { clientId: "client-a" });
    streams.push(s);
    expect(s.res.headers.get("content-type")).toContain("text/event-stream");
    expect(s.res.headers.get("cache-control")).toContain("no-cache");
    const hello = await s.waitFor((f) => f.event === "hello");
    expect(hello.data).toMatchObject({ clientId: "client-a", revision: 0 });
  });

  it("broadcasts task.created / task.updated / task.deleted to every connected client", async () => {
    const a = await openStream(base, { clientId: "client-a" });
    const b = await openStream(base, { clientId: "client-b" });
    streams.push(a, b);
    await a.waitFor((f) => f.event === "presence" && f.data.connections === 2);

    const created = await request(app)
      .post("/api/tasks")
      .set("x-client-id", "client-a")
      .set("x-mutation-id", "m-1")
      .send({ title: "Realtime", status: "todo" })
      .expect(201);
    const id = created.body.task.id;

    for (const s of [a, b]) {
      const f = await s.waitFor((x) => x.event === "task.created");
      const e = f.data as TaskEvent;
      expect(f.id).toBe(String(e.revision));
      expect(e).toMatchObject({ type: "task.created", taskId: id, clientId: "client-a", mutationId: "m-1", revision: 1 });
      expect(e.type === "task.created" && e.task.title).toBe("Realtime");
      expect(e.order).toEqual({ todo: [id] });
      expect(Number.isNaN(Date.parse(e.timestamp))).toBe(false);
    }

    await request(app).patch(`/api/tasks/${id}`).send({ status: "done", position: 0 }).expect(200);
    const upd = (await b.waitFor((x) => x.event === "task.updated")).data as TaskEvent;
    expect(upd).toMatchObject({ taskId: id, revision: 2, clientId: null, order: { todo: [], done: [id] } });

    await request(app).delete(`/api/tasks/${id}`).expect(204);
    const del = (await a.waitFor((x) => x.event === "task.deleted")).data as TaskEvent;
    expect(del).toMatchObject({ type: "task.deleted", taskId: id, revision: 3, order: { done: [] } });
    expect("task" in del).toBe(false);
  });

  it("cleans up connections on disconnect and updates presence", async () => {
    const a = await openStream(base);
    const b = await openStream(base);
    streams.push(a);
    await a.waitFor((f) => f.event === "presence" && f.data.connections === 2);
    expect(hub.size).toBe(2);
    const seen = a.frames.length;
    b.close();
    await a.waitFor((f) => a.frames.indexOf(f) >= seen && f.event === "presence" && f.data.connections === 1);
    expect(hub.size).toBe(1);
  });

  it("replays missed events after reconnect with Last-Event-ID", async () => {
    const a = await openStream(base);
    streams.push(a);
    await a.waitFor((f) => f.event === "hello");
    const t1 = await createTask(app, { title: "one" });
    await createTask(app, { title: "two" });
    await request(app).patch(`/api/tasks/${t1.id}`).send({ title: "one!" }).expect(200);

    const r = await openStream(base, { lastEventId: 1 });
    streams.push(r);
    await r.waitFor((f) => f.event === "task.updated");
    const replayed = r.frames.filter((f) => f.event.startsWith("task.")).map((f) => Number(f.id));
    expect(replayed).toEqual([2, 3]);
  });

  it("does not broadcast when the database operation fails (404 / 409 / 400 / simulated)", async () => {
    const t = await createTask(app, { title: "A" });
    await request(app).patch(`/api/tasks/${t.id}`).send({ title: "B" }).expect(200);
    const spy = vi.spyOn(hub, "publish");
    await request(app).patch("/api/tasks/00000000-0000-4000-8000-000000000000").send({ title: "x" }).expect(404);
    await request(app).delete("/api/tasks/00000000-0000-4000-8000-000000000000").expect(404);
    await request(app).patch(`/api/tasks/${t.id}`).send({ title: "C", expected: { title: "A" } }).expect(409);
    await request(app).post("/api/tasks").send({ title: "" }).expect(400);
    await request(app).post("/api/tasks").set("x-simulate-failure", "1").send({ title: "x" }).expect(503);
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });
});

describe("no broadcast when the database throws", () => {
  afterAll(() => prisma.$disconnect());

  it("returns 500 and publishes nothing if the transaction fails", async () => {
    await resetDb();
    const { app, hub, service } = makeApp();
    const spy = vi.spyOn(hub, "publish");
    vi.spyOn(service, "create").mockRejectedValueOnce(new Error("connection reset"));
    vi.spyOn(console, "error").mockImplementation(() => {});
    const res = await request(app).post("/api/tasks").send({ title: "A" }).expect(500);
    expect(res.body.error.code).toBe("INTERNAL_ERROR");
    expect(spy).not.toHaveBeenCalled();
    expect(await prisma.task.count()).toBe(0);
  });
});

describe("EventHub", () => {
  function fakeRes() {
    const chunks: string[] = [];
    return {
      chunks,
      res: {
        status: () => undefined,
        setHeader: () => undefined,
        flushHeaders: () => undefined,
        write: (c: string) => chunks.push(c),
        end: () => undefined,
      } as any,
    };
  }
  const ev = (revision: number): TaskEvent => ({
    type: "task.deleted",
    taskId: `t${revision}`,
    revision,
    timestamp: new Date().toISOString(),
    clientId: null,
    mutationId: null,
    order: {},
  });

  it("serialises frames with id, event and single-line JSON data", () => {
    expect(frame("task.deleted", { a: "x\ny" }, 7)).toBe('id: 7\nevent: task.deleted\ndata: {"a":"x\\ny"}\n\n');
  });

  it("asks the client to resync when the gap is older than the buffer", () => {
    const hub = new EventHub({ heartbeatMs: 60_000, bufferSize: 2 });
    for (let r = 1; r <= 5; r++) hub.publish(ev(r));
    const { res, chunks } = fakeRes();
    hub.connect(res, { clientId: "c", lastEventId: 1, revision: 5 });
    expect(chunks.join("")).toContain("event: resync");
    expect(chunks.join("")).not.toContain("event: task.deleted");
  });

  it("sends heartbeats", async () => {
    const hub = new EventHub({ heartbeatMs: 20 });
    const { res, chunks } = fakeRes();
    hub.connect(res, { clientId: "c", revision: 0 });
    hub.start();
    await new Promise((r) => setTimeout(r, 60));
    hub.stop();
    expect(chunks.some((c) => c.startsWith(": ping"))).toBe(true);
  });
});
