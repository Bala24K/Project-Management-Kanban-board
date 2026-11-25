import { describe, expect, it } from "vitest";
import type { BoardResponse, Status, Task, TaskEvent } from "@kanban/shared";
import { boardReducer, deriveColumns, initialBoardState, type BoardAction, type BoardState } from "./boardState";

let seq = 0;
function task(id: string, status: Status, position: number, extra: Partial<Task> = {}): Task {
  return {
    id,
    title: id.toUpperCase(),
    description: "",
    priority: "medium",
    assignee: "",
    status,
    position,
    revision: 1,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...extra,
  };
}

function loaded(tasks: Task[], revision = 10): BoardState {
  const board: BoardResponse = { board: { id: "main", title: "B" }, tasks, revision };
  return boardReducer(initialBoardState, { type: "snapshot", board });
}

const run = (s: BoardState, ...actions: BoardAction[]) => actions.reduce(boardReducer, s);

const ids = (s: BoardState, status: Status) => deriveColumns(s)[status].map((t) => t.id);
const view = (s: BoardState, id: string) => Object.values(deriveColumns(s)).flat().find((t) => t.id === id);

function updated(t: Task, revision: number, order: TaskEvent["order"] = {}, extra: Partial<TaskEvent> = {}): TaskEvent {
  return {
    type: "task.updated",
    taskId: t.id,
    task: { ...t, revision },
    revision,
    order,
    timestamp: new Date().toISOString(),
    clientId: "other",
    mutationId: null,
    ...extra,
  } as TaskEvent;
}

const mid = () => `m${++seq}`;

describe("snapshot + derive", () => {
  it("groups by status and orders by position", () => {
    const s = loaded([task("b", "todo", 1), task("a", "todo", 0), task("c", "done", 0)]);
    expect(ids(s, "todo")).toEqual(["a", "b"]);
    expect(ids(s, "done")).toEqual(["c"]);
    expect(ids(s, "backlog")).toEqual([]);
    expect(s.phase).toBe("ready");
  });
});

describe("optimistic updates and rollback", () => {
  const base = () => loaded([task("a", "todo", 0), task("b", "todo", 1), task("c", "done", 0)]);

  it("applies a move immediately and rolls back on failure", () => {
    const m = mid();
    let s = run(base(), { type: "mutationStarted", mutation: { id: m, kind: "update", taskId: "a", changes: { status: "done" }, position: 1 } });
    expect(ids(s, "todo")).toEqual(["b"]);
    expect(ids(s, "done")).toEqual(["c", "a"]);
    s = run(s, { type: "mutationFailed", mutationId: m });
    expect(ids(s, "todo")).toEqual(["a", "b"]);
    expect(ids(s, "done")).toEqual(["c"]);
    expect(s.pending).toEqual([]);
  });

  it("commits the server result on success", () => {
    const m = mid();
    let s = run(base(), { type: "mutationStarted", mutation: { id: m, kind: "update", taskId: "b", changes: {}, position: 0 } });
    expect(ids(s, "todo")).toEqual(["b", "a"]);
    s = run(s, {
      type: "mutationSucceeded",
      mutationId: m,
      change: { revision: 11, task: task("b", "todo", 0, { revision: 11 }), order: { todo: ["b", "a"] } },
    });
    expect(s.pending).toEqual([]);
    expect(ids(s, "todo")).toEqual(["b", "a"]);
    expect(s.confirmed.b!.revision).toBe(11);
  });

  it("an optimistic create that fails leaves no phantom task", () => {
    const m = mid();
    let s = run(base(), { type: "mutationStarted", mutation: { id: m, kind: "create", taskId: "n", task: task("n", "backlog", 0, { revision: 0 }) } });
    expect(ids(s, "backlog")).toEqual(["n"]);
    s = run(s, { type: "mutationFailed", mutationId: m });
    expect(ids(s, "backlog")).toEqual([]);
    expect(s.confirmed.n).toBeUndefined();
  });

  it("an optimistic delete that fails restores the task at its position", () => {
    const m = mid();
    let s = run(base(), { type: "mutationStarted", mutation: { id: m, kind: "delete", taskId: "a" } });
    expect(ids(s, "todo")).toEqual(["b"]);
    s = run(s, { type: "mutationFailed", mutationId: m });
    expect(ids(s, "todo")).toEqual(["a", "b"]);
  });

  it("a failing OLDER mutation does not roll back a NEWER successful one", () => {
    const m1 = mid();
    const m2 = mid();
    let s = run(
      base(),
      { type: "mutationStarted", mutation: { id: m1, kind: "update", taskId: "a", changes: { priority: "high" } } },
      { type: "mutationStarted", mutation: { id: m2, kind: "update", taskId: "c", changes: { status: "todo" }, position: 0 } },
    );
    expect(view(s, "a")!.priority).toBe("high");
    expect(ids(s, "todo")).toEqual(["c", "a", "b"]);
    // Newer one succeeds first, then the older one fails.
    s = run(
      s,
      {
        type: "mutationSucceeded",
        mutationId: m2,
        change: { revision: 11, task: task("c", "todo", 0, { revision: 11 }), order: { todo: ["c", "a", "b"], done: [] } },
      },
      { type: "mutationFailed", mutationId: m1 },
    );
    expect(view(s, "a")!.priority).toBe("medium"); // m1 rolled back
    expect(ids(s, "todo")).toEqual(["c", "a", "b"]); // m2 kept
    expect(ids(s, "done")).toEqual([]);
  });

  it("two pending edits of the same task: failure of the first keeps the second", () => {
    const m1 = mid();
    const m2 = mid();
    let s = run(
      base(),
      { type: "mutationStarted", mutation: { id: m1, kind: "update", taskId: "a", changes: { title: "First" } } },
      { type: "mutationStarted", mutation: { id: m2, kind: "update", taskId: "a", changes: { priority: "low" } } },
      { type: "mutationFailed", mutationId: m1 },
    );
    expect(view(s, "a")).toMatchObject({ title: "A", priority: "low" });
  });

  it("adopts the server's current version on a 409 conflict", () => {
    const m = mid();
    const s = run(
      base(),
      { type: "mutationStarted", mutation: { id: m, kind: "update", taskId: "a", changes: { title: "Mine" } } },
      { type: "mutationFailed", mutationId: m, current: task("a", "todo", 0, { title: "Theirs", revision: 12 }) },
    );
    expect(view(s, "a")!.title).toBe("Theirs");
  });
});

describe("real-time reconciliation", () => {
  const base = () => loaded([task("a", "todo", 0), task("b", "todo", 1)]);

  it("applies remote create / update / delete", () => {
    let s = base();
    s = run(s, {
      type: "remoteEvent",
      event: { ...updated(task("n", "backlog", 0), 11, { backlog: ["n"] }), type: "task.created" } as TaskEvent,
    });
    expect(ids(s, "backlog")).toEqual(["n"]);
    s = run(s, { type: "remoteEvent", event: updated(task("a", "todo", 0, { title: "Renamed" }), 12) });
    expect(view(s, "a")!.title).toBe("Renamed");
    s = run(s, {
      type: "remoteEvent",
      event: { type: "task.deleted", taskId: "b", revision: 13, order: { todo: ["a"] }, timestamp: "", clientId: null, mutationId: null },
    });
    expect(ids(s, "todo")).toEqual(["a"]);
  });

  it("does NOT overwrite a pending local change; reconciles when it settles", () => {
    const m = mid();
    let s = run(base(), { type: "mutationStarted", mutation: { id: m, kind: "update", taskId: "a", changes: { title: "Local" } } });
    // Another user renames + reprioritises the same task meanwhile.
    s = run(s, { type: "remoteEvent", event: updated(task("a", "todo", 0, { title: "Remote", priority: "high" }), 11) });
    // Local optimistic title wins in the view; the untouched field shows the remote value.
    expect(view(s, "a")).toMatchObject({ title: "Local", priority: "high" });
    // Local request fails -> the remote version is what remains (not the stale pre-edit one).
    const failed = run(s, { type: "mutationFailed", mutationId: m });
    expect(view(failed, "a")).toMatchObject({ title: "Remote", priority: "high" });
    // Or it succeeds -> the server result (newer revision) wins.
    const ok = run(s, {
      type: "mutationSucceeded",
      mutationId: m,
      change: { revision: 12, task: task("a", "todo", 0, { title: "Local", priority: "high", revision: 12 }), order: {} },
    });
    expect(view(ok, "a")).toMatchObject({ title: "Local", priority: "high" });
  });

  it("a remote move of another task does not disturb a pending local drag", () => {
    const s0 = loaded([task("a", "todo", 0), task("b", "todo", 1), task("c", "todo", 2)]);
    const m = mid();
    let s = run(s0, { type: "mutationStarted", mutation: { id: m, kind: "update", taskId: "c", changes: { status: "done" }, position: 0 } });
    s = run(s, { type: "remoteEvent", event: updated(task("a", "todo", 2), 11, { todo: ["b", "c", "a"] }) });
    expect(ids(s, "todo")).toEqual(["b", "a"]);
    expect(ids(s, "done")).toEqual(["c"]);
  });

  it("treats the client's own echo as an acknowledgement (idempotent)", () => {
    const m = mid();
    const result = task("a", "todo", 0, { title: "Mine", revision: 11 });
    let s = run(base(), { type: "mutationStarted", mutation: { id: m, kind: "update", taskId: "a", changes: { title: "Mine" } } });
    // SSE echo can arrive before the HTTP response...
    s = run(s, { type: "remoteEvent", event: updated(result, 11, {}, { clientId: "me", mutationId: m }) });
    expect(view(s, "a")!.title).toBe("Mine");
    const afterEcho = s.confirmed;
    // ...and the response is then a no-op.
    s = run(s, { type: "mutationSucceeded", mutationId: m, change: { revision: 11, task: result, order: {} } });
    expect(s.confirmed).toBe(afterEcho);
    expect(s.pending).toEqual([]);
  });

  it("ignores stale events (older revision than what we have)", () => {
    let s = run(base(), { type: "remoteEvent", event: updated(task("a", "todo", 0, { title: "New" }), 12) });
    s = run(s, { type: "remoteEvent", event: updated(task("a", "todo", 0, { title: "Old" }), 11) });
    expect(view(s, "a")!.title).toBe("New");
  });

  it("ignores events already included in the snapshot", () => {
    const s = run(base(), { type: "remoteEvent", event: updated(task("a", "todo", 0, { title: "Older" }), 9) });
    expect(view(s, "a")!.title).toBe("A");
  });

  it("ignores stale column order snapshots", () => {
    let s = run(base(), { type: "remoteEvent", event: updated(task("b", "todo", 0), 12, { todo: ["b", "a"] }) });
    s = run(s, { type: "remoteEvent", event: updated(task("a", "todo", 0), 11, { todo: ["a", "b"] }) });
    expect(ids(s, "todo")).toEqual(["b", "a"]);
  });

  it("never resurrects a remotely deleted task (late update, pending local edit)", () => {
    const m = mid();
    let s = run(base(), { type: "mutationStarted", mutation: { id: m, kind: "update", taskId: "a", changes: { title: "Local" } } });
    s = run(s, {
      type: "remoteEvent",
      event: { type: "task.deleted", taskId: "a", revision: 12, order: { todo: ["b"] }, timestamp: "", clientId: null, mutationId: null },
    });
    expect(view(s, "a")).toBeUndefined(); // pending edit doesn't bring it back
    s = run(s, { type: "remoteEvent", event: updated(task("a", "todo", 0, { title: "Late" }), 11) });
    expect(view(s, "a")).toBeUndefined(); // late update doesn't either
    s = run(s, { type: "mutationFailed", mutationId: m, deletedId: "a" });
    expect(view(s, "a")).toBeUndefined();
    // Even a resync snapshot that raced the delete can't bring it back.
    s = boardReducer(s, { type: "snapshot", board: { board: { id: "main", title: "B" }, tasks: [task("a", "todo", 0), task("b", "todo", 1)], revision: 11 } });
    expect(view(s, "a")).toBeUndefined();
  });

  it("keeps pending mutations across a resync snapshot", () => {
    const m = mid();
    let s = run(base(), { type: "mutationStarted", mutation: { id: m, kind: "update", taskId: "a", changes: { title: "Local" } } });
    s = boardReducer(s, { type: "snapshot", board: { board: { id: "main", title: "B" }, tasks: [task("a", "todo", 0, { revision: 20 })], revision: 20 } });
    expect(view(s, "a")!.title).toBe("Local");
  });
});
