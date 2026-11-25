import { STATUSES, type Status, type Task, type TaskEvent } from "@kanban/shared";

/**
 * In-memory stand-in for the API used by component tests. Real-backend coverage
 * lives in apps/api tests and the Playwright e2e suite.
 */
export class FakeBackend {
  tasks: Task[] = [];
  revision = 10;
  requests: Array<{ method: string; path: string; body: any; headers: Headers }> = [];
  /** When set, write requests wait until release() is called. */
  holding = false;
  private held: Array<() => void> = [];
  failNext = 0;

  seed(tasks: Array<Partial<Task> & { id: string; title: string; status: Status }>) {
    const counts: Record<string, number> = {};
    this.tasks = tasks.map((t) => ({
      description: "",
      priority: "medium",
      assignee: "",
      revision: 1,
      createdAt: "2026-11-25T10:00:00.000Z",
      updatedAt: "2026-11-25T10:00:00.000Z",
      position: (counts[t.status] = (counts[t.status] ?? -1) + 1),
      ...t,
    })) as Task[];
  }

  release() {
    const h = this.held.splice(0);
    h.forEach((r) => r());
  }

  order(status: Status): string[] {
    return this.tasks.filter((t) => t.status === status).sort((a, b) => a.position - b.position).map((t) => t.id);
  }

  private renumber(status: Status, ids: string[]) {
    ids.forEach((id, i) => {
      const t = this.tasks.find((x) => x.id === id);
      if (t) t.position = i;
    });
    void status;
  }

  fetch = async (input: RequestInfo | URL, init: RequestInit = {}): Promise<Response> => {
    const url = new URL(String(input), "http://localhost");
    const method = init.method ?? "GET";
    const body = init.body ? JSON.parse(String(init.body)) : undefined;
    this.requests.push({ method, path: url.pathname, body, headers: new Headers(init.headers) });
    const json = (status: number, data?: unknown) =>
      new Response(data === undefined ? null : JSON.stringify(data), { status, headers: { "content-type": "application/json" } });

    if (url.pathname === "/api/health") return json(200, { ok: true, failureSimulation: true });
    if (url.pathname === "/api/board") {
      return json(200, { board: { id: "main", title: "Test Board" }, tasks: structuredClone(this.tasks), revision: this.revision });
    }

    if (this.holding) await new Promise<void>((r) => this.held.push(r));
    if (this.failNext > 0 || new Headers(init.headers).get("x-simulate-failure") === "1") {
      this.failNext = Math.max(0, this.failNext - 1);
      return json(503, { error: { code: "SIMULATED_FAILURE", message: "The server failed to process this request (simulated failure)." } });
    }

    const now = new Date().toISOString();
    if (method === "POST" && url.pathname === "/api/tasks") {
      const rev = ++this.revision;
      const status: Status = body.status ?? "backlog";
      const task: Task = {
        id: body.id,
        title: body.title,
        description: body.description ?? "",
        priority: body.priority ?? "medium",
        assignee: body.assignee ?? "",
        status,
        position: this.order(status).length,
        revision: rev,
        createdAt: now,
        updatedAt: now,
      };
      this.tasks.push(task);
      return json(201, { task, order: { [status]: this.order(status) }, revision: rev });
    }

    const m = url.pathname.match(/^\/api\/tasks\/(.+)$/);
    const task = m ? this.tasks.find((t) => t.id === m[1]) : undefined;
    if (!task) return json(404, { error: { code: "NOT_FOUND", message: "Task not found" } });

    if (method === "PATCH") {
      for (const [f, base] of Object.entries(body.expected ?? {})) {
        const cur = (task as any)[f];
        if (cur !== base && cur !== body[f]) {
          return json(409, { error: { code: "CONFLICT", message: `This task was changed by someone else (${f}).`, current: task } });
        }
      }
      const rev = ++this.revision;
      const from = task.status;
      const to: Status = body.status ?? from;
      const src = this.order(from).filter((id) => id !== task.id);
      const dest = to === from ? src : this.order(to);
      const index = Math.min(body.position ?? (to === from ? task.position : dest.length), dest.length);
      dest.splice(index, 0, task.id);
      Object.assign(task, { ...body, expected: undefined, status: to, revision: rev, updatedAt: now });
      delete (task as any).expected;
      const order: Partial<Record<Status, string[]>> = { [to]: dest };
      if (to !== from) order[from] = src;
      for (const s of STATUSES) if (order[s]) this.renumber(s, order[s]!);
      return json(200, { task: structuredClone(task), order, revision: rev });
    }
    if (method === "DELETE") {
      ++this.revision;
      this.tasks = this.tasks.filter((t) => t.id !== task.id);
      this.renumber(task.status, this.order(task.status));
      return json(204);
    }
    return json(404, { error: { code: "NOT_FOUND", message: "?" } });
  };
}

type Listener = (e: MessageEvent<string>) => void;

export class FakeEventSource {
  static instances: FakeEventSource[] = [];
  static CONNECTING = 0;
  static OPEN = 1;
  static CLOSED = 2;
  readonly CONNECTING = 0;
  readonly OPEN = 1;
  readonly CLOSED = 2;
  readyState = 0;
  onopen: ((e: Event) => void) | null = null;
  onerror: ((e: Event) => void) | null = null;
  private listeners = new Map<string, Listener[]>();

  constructor(public url: string) {
    FakeEventSource.instances.push(this);
  }

  addEventListener(type: string, fn: Listener) {
    this.listeners.set(type, [...(this.listeners.get(type) ?? []), fn]);
  }
  removeEventListener() {}
  close() {
    this.readyState = 2;
  }

  open(revision = 10) {
    this.readyState = 1;
    this.onopen?.(new Event("open"));
    this.emit("hello", { clientId: "x", revision, connections: 2 });
    this.emit("presence", { connections: 2 });
  }

  emit(type: string, data: unknown, id?: string) {
    const e = new MessageEvent(type, { data: JSON.stringify(data), lastEventId: id ?? "" });
    for (const fn of this.listeners.get(type) ?? []) fn(e);
  }

  emitTask(event: TaskEvent) {
    this.emit(event.type, event, String(event.revision));
  }

  static get latest(): FakeEventSource {
    return FakeEventSource.instances[FakeEventSource.instances.length - 1]!;
  }
}
