import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { STATUS_LABELS, type Task, type TaskEvent } from "@kanban/shared";
import App from "./App";
import { FakeBackend, FakeEventSource } from "./test/fakeBackend";
import { setSimulateFailures } from "./lib/api";

let backend: FakeBackend;

const A = "11111111-1111-4111-8111-111111111111";
const B = "22222222-2222-4222-8222-222222222222";
const C = "33333333-3333-4333-8333-333333333333";

beforeEach(() => {
  backend = new FakeBackend();
  backend.seed([
    { id: A, title: "Payment retry", status: "todo", priority: "high", assignee: "Alex" },
    { id: B, title: "Write docs", status: "todo", priority: "low", assignee: "Sam" },
    { id: C, title: "Payment copy", status: "done", priority: "low", assignee: "Priya" },
  ]);
  FakeEventSource.instances = [];
  vi.stubGlobal("fetch", backend.fetch);
  vi.stubGlobal("EventSource", FakeEventSource);
  window.history.replaceState(null, "", "/");
  setSimulateFailures(false);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

async function renderBoard() {
  const user = userEvent.setup();
  render(<App />);
  await waitFor(() => expect(FakeEventSource.instances.length).toBeGreaterThan(0));
  act(() => FakeEventSource.latest.open());
  await screen.findAllByTestId("task-card");
  return user;
}

const column = (label: string) => screen.getByRole("region", { name: label });
const cardTitles = (label: string) =>
  within(column(label))
    .queryAllByTestId("task-card")
    .map((c) => c.querySelector("h3")!.textContent);

function remote(event: Partial<TaskEvent> & Pick<TaskEvent, "type" | "taskId" | "revision">): TaskEvent {
  return { timestamp: new Date().toISOString(), clientId: "other-client", mutationId: null, order: {}, ...event } as TaskEvent;
}

describe("board rendering", () => {
  it("renders the four columns in order with tasks grouped by status", async () => {
    await renderBoard();
    const regions = screen.getAllByRole("region").map((r) => r.getAttribute("aria-label"));
    expect(regions).toEqual(["Backlog", "Todo", "In Progress", "Done"]);
    expect(cardTitles("Todo")).toEqual(["Payment retry", "Write docs"]);
    expect(cardTitles("Done")).toEqual(["Payment copy"]);
    expect(within(column("Backlog")).getByText("No tasks yet")).toBeInTheDocument();
    expect(screen.getByTestId("connection-status")).toHaveAttribute("data-state", "live");
  });

  it("shows a loading skeleton before data arrives", async () => {
    render(<App />);
    expect(screen.getByLabelText("Loading board")).toBeInTheDocument();
  });
});

describe("create / edit / delete (optimistic)", () => {
  it("creates a task optimistically and keeps it after the server confirms", async () => {
    const user = await renderBoard();
    backend.holding = true;
    await user.click(screen.getByRole("button", { name: /new task/i }));
    await user.type(screen.getByLabelText("Title"), "Brand new task");
    await user.selectOptions(screen.getByLabelText("Priority"), "high");
    await user.type(screen.getByLabelText("Assignee"), "Dana");
    await user.click(screen.getByRole("button", { name: "Create task" }));

    // Visible immediately, before the server answered.
    expect(cardTitles("Backlog")).toEqual(["Brand new task"]);
    expect(within(column("Backlog")).getByLabelText("Saving")).toBeInTheDocument();
    const post = backend.requests.find((r) => r.method === "POST")!;
    expect(post.body).toMatchObject({ title: "Brand new task", priority: "high", assignee: "Dana", status: "backlog" });
    expect(post.headers.get("x-mutation-id")).toBeTruthy();
    expect(post.headers.get("x-client-id")).toBeTruthy();

    await act(async () => backend.release());
    await waitFor(() => expect(within(column("Backlog")).queryByLabelText("Saving")).toBeNull());
    expect(cardTitles("Backlog")).toEqual(["Brand new task"]);
  });

  it("rolls back a failed create and shows an error", async () => {
    const user = await renderBoard();
    backend.failNext = 1;
    await user.click(screen.getByRole("button", { name: /new task/i }));
    await user.type(screen.getByLabelText("Title"), "Doomed");
    await user.click(screen.getByRole("button", { name: "Create task" }));
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(/Couldn't create "Doomed"/);
    expect(alert).toHaveTextContent(/rolled back/);
    expect(cardTitles("Backlog")).toEqual([]);
  });

  it("edits a task in the detail drawer", async () => {
    const user = await renderBoard();
    await user.click(screen.getByText("Write docs"));
    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByLabelText("Description")).toHaveValue("");
    const title = within(dialog).getByLabelText("Title");
    await user.clear(title);
    await user.type(title, "Write API docs");
    await user.type(within(dialog).getByLabelText("Description"), "Webhooks too");
    await user.selectOptions(within(dialog).getByLabelText("Priority"), "medium");
    await user.selectOptions(within(dialog).getByLabelText("Status"), "in_progress");
    backend.holding = true;
    await user.click(within(dialog).getByRole("button", { name: "Save" }));

    // Optimistic: moved and renamed immediately.
    expect(cardTitles("In Progress")).toEqual(["Write API docs"]);
    expect(cardTitles("Todo")).toEqual(["Payment retry"]);
    const patch = backend.requests.find((r) => r.method === "PATCH")!;
    expect(patch.body).toEqual({
      title: "Write API docs",
      description: "Webhooks too",
      priority: "medium",
      status: "in_progress",
      expected: { title: "Write docs", description: "", priority: "low", status: "todo" },
    });
    await act(async () => backend.release());
    await waitFor(() => expect(screen.queryByLabelText("Saving")).toBeNull());
    expect(backend.tasks.find((t) => t.id === B)).toMatchObject({ title: "Write API docs", status: "in_progress" });
  });

  it("rolls back a failed edit", async () => {
    const user = await renderBoard();
    await user.click(screen.getByText("Write docs"));
    const title = within(screen.getByRole("dialog")).getByLabelText("Title");
    await user.clear(title);
    await user.type(title, "Will fail");
    backend.failNext = 1;
    await user.click(screen.getByRole("button", { name: "Save" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(/Couldn't save "Write docs"/);
    expect(cardTitles("Todo")).toEqual(["Payment retry", "Write docs"]);
  });

  it("deletes a task, and restores it when the delete fails", async () => {
    const user = await renderBoard();
    backend.failNext = 1;
    await user.click(screen.getByText("Write docs"));
    await user.click(screen.getByRole("button", { name: /delete/i }));
    await user.click(screen.getByRole("button", { name: "Delete" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(/Couldn't delete "Write docs"/);
    expect(cardTitles("Todo")).toEqual(["Payment retry", "Write docs"]);

    await user.click(screen.getByText("Write docs"));
    await user.click(screen.getByRole("button", { name: /delete/i }));
    await user.click(screen.getByRole("button", { name: "Delete" }));
    expect(cardTitles("Todo")).toEqual(["Payment retry"]);
    await waitFor(() => expect(backend.tasks.some((t) => t.id === B)).toBe(false));
    expect(cardTitles("Todo")).toEqual(["Payment retry"]);
  });

  it("the 'simulate failures' toggle makes writes fail and roll back", async () => {
    const user = await renderBoard();
    await user.click(await screen.findByTestId("simulate-failures"));
    await user.click(screen.getByText("Payment copy"));
    await user.selectOptions(within(screen.getByRole("dialog")).getByLabelText("Status"), "backlog");
    await user.click(screen.getByRole("button", { name: "Save" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(/simulated failure/);
    expect(cardTitles("Done")).toEqual(["Payment copy"]);
    expect(cardTitles("Backlog")).toEqual([]);
  });
});

describe("real-time updates", () => {
  it("applies remote create, update and delete without reload", async () => {
    await renderBoard();
    const es = FakeEventSource.latest;
    const n: Task = { ...backend.tasks[0]!, id: "44444444-4444-4444-8444-444444444444", title: "From Bob", status: "backlog", position: 0, revision: 11 };
    act(() => es.emitTask(remote({ type: "task.created", taskId: n.id, task: n, revision: 11, order: { backlog: [n.id] } })));
    expect(cardTitles("Backlog")).toEqual(["From Bob"]);

    const moved = { ...n, status: "done" as const, position: 0, title: "From Bob (edited)", revision: 12 };
    act(() => es.emitTask(remote({ type: "task.updated", taskId: n.id, task: moved, revision: 12, order: { backlog: [], done: [n.id, C] } })));
    expect(cardTitles("Backlog")).toEqual([]);
    expect(cardTitles("Done")).toEqual(["From Bob (edited)", "Payment copy"]);

    act(() => es.emitTask(remote({ type: "task.deleted", taskId: C, revision: 13, order: { done: [n.id] } })));
    expect(cardTitles("Done")).toEqual(["From Bob (edited)"]);
  });

  it("does not let a remote event overwrite a pending local edit", async () => {
    const user = await renderBoard();
    await user.click(screen.getByText("Write docs"));
    const title = within(screen.getByRole("dialog")).getByLabelText("Title");
    await user.clear(title);
    await user.type(title, "Local title");
    backend.holding = true;
    await user.click(screen.getByRole("button", { name: "Save" }));
    expect(cardTitles("Todo")).toContain("Local title");

    // Someone else renames it and changes priority while our request is in flight.
    const theirs = { ...backend.tasks.find((t) => t.id === B)!, title: "Their title", priority: "high" as const, revision: 11 };
    act(() => FakeEventSource.latest.emitTask(remote({ type: "task.updated", taskId: B, task: theirs, revision: 11 })));
    expect(cardTitles("Todo")).toContain("Local title");
    expect(cardTitles("Todo")).not.toContain("Their title");

    // The server rejects ours (title conflict) -> we show theirs, not our stale pre-edit value.
    Object.assign(backend.tasks.find((t) => t.id === B)!, { title: "Their title", priority: "high", revision: 11 });
    await act(async () => backend.release());
    expect(await screen.findByRole("alert")).toHaveTextContent(/changed by someone else/);
    expect(cardTitles("Todo")).toContain("Their title");
  });

  it("ignores stale events and the client's own echo", async () => {
    await renderBoard();
    const es = FakeEventSource.latest;
    const t = backend.tasks.find((x) => x.id === A)!;
    act(() => es.emitTask(remote({ type: "task.updated", taskId: A, task: { ...t, title: "Newer", revision: 15 }, revision: 15 })));
    act(() => es.emitTask(remote({ type: "task.updated", taskId: A, task: { ...t, title: "Older", revision: 14 }, revision: 14 })));
    act(() => es.emitTask(remote({ type: "task.updated", taskId: A, task: { ...t, title: "Pre-snapshot", revision: 5 }, revision: 5 })));
    expect(cardTitles("Todo")).toEqual(["Newer", "Write docs"]);
  });

  it("shows reconnecting state when the stream drops", async () => {
    await renderBoard();
    const es = FakeEventSource.latest;
    act(() => {
      es.readyState = 0;
      es.onerror?.(new Event("error"));
    });
    expect(screen.getByTestId("connection-status")).toHaveAttribute("data-state", "reconnecting");
  });
});

describe("search, filters and URL state", () => {
  it("restores filters from the URL on load (refresh)", async () => {
    window.history.replaceState(null, "", "/?search=payment&priority=low&assignee=priya");
    await renderBoard().catch(() => undefined);
    await waitFor(() => expect(cardTitles("Done")).toEqual(["Payment copy"]));
    expect(screen.getByLabelText("Search tasks by title")).toHaveValue("payment");
    expect(screen.getByLabelText("Filter by priority")).toHaveValue("low");
    expect(screen.getByLabelText("Filter by assignee")).toHaveValue("Priya");
    expect(cardTitles("Todo")).toEqual([]);
    expect(screen.getByTestId("match-count")).toHaveTextContent("1 of 3 tasks");
  });

  it("writes combined filters to the URL, clears them, and follows back/forward", async () => {
    const user = await renderBoard();
    await user.type(screen.getByLabelText("Search tasks by title"), "Pay");
    expect(window.location.search).toBe("?search=Pay");
    await user.selectOptions(screen.getByLabelText("Filter by priority"), "high");
    expect(window.location.search).toBe("?search=Pay&priority=high");
    await user.selectOptions(screen.getByLabelText("Filter by assignee"), "Alex");
    expect(window.location.search).toBe("?search=Pay&priority=high&assignee=Alex");
    expect(cardTitles("Todo")).toEqual(["Payment retry"]);
    expect(cardTitles("Done")).toEqual([]);

    // Filtering never changes the data: clearing shows everything again.
    await user.click(screen.getByRole("button", { name: /clear/i }));
    expect(window.location.search).toBe("");
    expect(cardTitles("Todo")).toEqual(["Payment retry", "Write docs"]);

    // Back restores the previous filter set.
    await act(async () => {
      window.history.back();
      await new Promise((r) => setTimeout(r, 50));
    });
    await waitFor(() => expect(screen.getByLabelText("Filter by priority")).toHaveValue("high"));
    expect(cardTitles("Todo")).toEqual(["Payment retry"]);
  });
});

it("column labels match the shared constants", () => {
  expect(Object.values(STATUS_LABELS)).toEqual(["Backlog", "Todo", "In Progress", "Done"]);
});
