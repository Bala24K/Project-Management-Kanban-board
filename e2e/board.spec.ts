import { expect, test, type APIRequestContext, type Locator, type Page } from "@playwright/test";
import type { BoardResponse, Status } from "@kanban/shared";

/* ---------------- helpers ---------------- */

const column = (page: Page, label: string) => page.getByRole("region", { name: label, exact: true });
const card = (scope: Page | Locator, title: string) => scope.getByTestId("task-card").filter({ hasText: title });

async function titlesIn(page: Page, label: string): Promise<string[]> {
  return column(page, label).locator('[data-testid="task-card"] h3').allTextContents();
}

async function board(request: APIRequestContext): Promise<BoardResponse> {
  return (await request.get("/api/board")).json();
}

async function clearBoard(request: APIRequestContext) {
  for (const t of (await board(request)).tasks) await request.delete(`/api/tasks/${t.id}`);
}

async function seed(request: APIRequestContext, status: Status, titles: string[]) {
  for (const title of titles) {
    const res = await request.post("/api/tasks", { data: { title, status } });
    expect(res.status()).toBe(201);
  }
}

async function openBoard(page: Page, path = "/") {
  await page.goto(path);
  await expect(page.getByTestId("connection-status")).toHaveAttribute("data-state", "live");
  // Marker to prove no page reload happens during a test.
  await page.evaluate(() => ((window as unknown as { __noReload: boolean }).__noReload = true));
}

async function expectNoReload(page: Page) {
  expect(await page.evaluate(() => (window as unknown as { __noReload?: boolean }).__noReload)).toBe(true);
}

/** Pointer drag with intermediate moves so dnd-kit's sensors activate. */
async function drag(page: Page, source: Locator, target: Locator, where: "top" | "bottom" | "center" = "center") {
  const s = (await source.boundingBox())!;
  const t = (await target.boundingBox())!;
  await page.mouse.move(s.x + s.width / 2, s.y + s.height / 2);
  await page.mouse.down();
  await page.mouse.move(s.x + s.width / 2 + 8, s.y + s.height / 2 + 8, { steps: 4 });
  const y = where === "top" ? t.y + 6 : where === "bottom" ? t.y + t.height - 6 : t.y + t.height / 2;
  await page.mouse.move(t.x + t.width / 2, y, { steps: 20 });
  await page.waitForTimeout(150);
  await page.mouse.up();
  // dnd-kit ignores a new drag until the previous drop animation has settled
  // (~200ms). Real users never re-grab that fast; tests chaining drags can.
  await page.waitForTimeout(400);
}

test.beforeEach(async ({ request }) => {
  await clearBoard(request);
});

/* ---------------- tests ---------------- */

test("two independent clients collaborate in real time (create, edit, move, failed move)", async ({ browser, request }) => {
  const ctxA = await browser.newContext();
  const ctxB = await browser.newContext();
  const a = await ctxA.newPage();
  const b = await ctxB.newPage();

  // 1-2. Both clients open the board.
  await openBoard(a);
  await openBoard(b);
  await expect(a.getByTestId("presence")).toHaveText("1 other viewing");

  // 3. Client A creates a task.
  await a.getByRole("button", { name: "New task" }).click();
  await a.getByLabel("Title", { exact: true }).fill("Ship collaborative board");
  await a.getByLabel("Assignee", { exact: true }).fill("Alex");
  await a.getByRole("button", { name: "Create task" }).click();
  await expect(card(column(a, "Backlog"), "Ship collaborative board")).toBeVisible();

  // 4. Client B sees it without refreshing.
  await expect(card(column(b, "Backlog"), "Ship collaborative board")).toBeVisible();

  // 5. Client B edits the task.
  await card(b, "Ship collaborative board").click();
  await b.getByLabel("Title", { exact: true }).fill("Ship collaborative board v2");
  await b.getByLabel("Priority", { exact: true }).selectOption("high");
  await b.getByLabel("Description", { exact: true }).fill("Edited by client B");
  await b.getByRole("button", { name: "Save" }).click();

  // 6. Client A receives the update.
  const aCard = card(column(a, "Backlog"), "Ship collaborative board v2");
  await expect(aCard).toBeVisible();
  await expect(aCard).toContainText("High");
  await expect(aCard).toContainText("Edited by client B");

  // 7. Client A moves the task to another column (drag and drop), next to an existing task.
  await seed(request, "in_progress", ["Existing in progress"]);
  await expect(card(column(a, "In Progress"), "Existing in progress")).toBeVisible();
  await drag(a, aCard, card(column(a, "In Progress"), "Existing in progress"), "top");
  await expect.poll(() => titlesIn(a, "In Progress")).toEqual(["Ship collaborative board v2", "Existing in progress"]);

  // 8. Client B sees the new status and position.
  await expect.poll(() => titlesIn(b, "In Progress")).toEqual(["Ship collaborative board v2", "Existing in progress"]);
  await expect(card(column(b, "Backlog"), "Ship collaborative board v2")).toHaveCount(0);
  const persisted = (await board(request)).tasks.find((t) => t.title === "Ship collaborative board v2")!;
  expect(persisted).toMatchObject({ status: "in_progress", position: 0, priority: "high", assignee: "Alex" });

  // 9. Force an API failure and verify rollback.
  await a.getByTestId("simulate-failures").check();
  await drag(a, card(column(a, "In Progress"), "Ship collaborative board v2"), column(a, "Done"));
  await expect(a.getByRole("alert")).toContainText("Couldn't move");
  await expect(a.getByRole("alert")).toContainText("rolled back");
  await expect.poll(() => titlesIn(a, "In Progress")).toEqual(["Ship collaborative board v2", "Existing in progress"]);
  await expect(card(column(a, "Done"), "Ship collaborative board v2")).toHaveCount(0);
  await expect(card(column(b, "Done"), "Ship collaborative board v2")).toHaveCount(0);
  expect((await board(request)).tasks.find((t) => t.id === persisted.id)!.status).toBe("in_progress");

  await expectNoReload(a);
  await expectNoReload(b);
  await ctxA.close();
  await ctxB.close();
});

test("reorders within a column by drag and drop; order persists after reload", async ({ page, request }) => {
  await seed(request, "todo", ["One", "Two", "Three"]);
  await openBoard(page);
  await expect.poll(() => titlesIn(page, "Todo")).toEqual(["One", "Two", "Three"]);

  await drag(page, card(page, "Three"), card(page, "One"), "top");
  await expect.poll(() => titlesIn(page, "Todo")).toEqual(["Three", "One", "Two"]);

  await expect
    .poll(async () => (await board(request)).tasks.filter((t) => t.status === "todo").sort((x, y) => x.position - y.position).map((t) => t.title))
    .toEqual(["Three", "One", "Two"]);
  await page.reload();
  await expect.poll(() => titlesIn(page, "Todo")).toEqual(["Three", "One", "Two"]);
});

test("moves a task with the keyboard", async ({ page, request }) => {
  await seed(request, "todo", ["Alpha", "Beta"]);
  await openBoard(page);
  await card(page, "Alpha").getByRole("button").focus();
  await page.keyboard.press("Space");
  await page.waitForTimeout(150);
  await page.keyboard.press("ArrowDown");
  await page.waitForTimeout(250);
  await page.keyboard.press("Space");
  await expect.poll(() => titlesIn(page, "Todo")).toEqual(["Beta", "Alpha"]);
  await expect
    .poll(async () => (await board(request)).tasks.find((t) => t.title === "Alpha")!.position)
    .toBe(1);
});

test("rolls back a failed drag and shows an error", async ({ page, request }) => {
  await seed(request, "todo", ["Stays put", "Neighbour"]);
  await openBoard(page);
  await page.getByTestId("simulate-failures").check();
  await drag(page, card(page, "Stays put"), column(page, "Done"));
  await expect(page.getByRole("alert")).toContainText("simulated failure");
  await expect.poll(() => titlesIn(page, "Todo")).toEqual(["Stays put", "Neighbour"]);
  await expect(card(column(page, "Done"), "Stays put")).toHaveCount(0);
});

test("search and filters combine, sync to the URL and survive refresh and back/forward", async ({ page, request }) => {
  await request.post("/api/tasks", { data: { title: "Payment retry", priority: "high", assignee: "Alex", status: "todo" } });
  await request.post("/api/tasks", { data: { title: "Payment copy", priority: "low", assignee: "Priya", status: "done" } });
  await request.post("/api/tasks", { data: { title: "Payment webhook", priority: "high", assignee: "Priya", status: "backlog" } });
  await request.post("/api/tasks", { data: { title: "Dark mode", priority: "high", assignee: "Alex", status: "backlog" } });

  await openBoard(page);
  await page.getByLabel("Search tasks by title").fill("payment");
  await page.getByLabel("Filter by priority").selectOption("high");
  await page.getByLabel("Filter by assignee").selectOption("Priya");
  await expect(page).toHaveURL(/\?search=payment&priority=high&assignee=Priya$/);
  await expect(page.getByTestId("task-card")).toHaveCount(1);
  await expect(card(page, "Payment webhook")).toBeVisible();

  // Refresh restores everything.
  await page.reload();
  await expect(page.getByLabel("Search tasks by title")).toHaveValue("payment");
  await expect(page.getByLabel("Filter by priority")).toHaveValue("high");
  await expect(page.getByLabel("Filter by assignee")).toHaveValue("Priya");
  await expect(page.getByTestId("task-card")).toHaveCount(1);

  // Back goes to the previous filter state (no assignee) without reloading.
  await page.evaluate(() => ((window as unknown as { __noReload: boolean }).__noReload = true));
  await page.goBack();
  await expect(page).toHaveURL(/\?search=payment&priority=high$/);
  await expect(page.getByTestId("task-card")).toHaveCount(2);
  await page.goForward();
  await expect(page.getByTestId("task-card")).toHaveCount(1);
  await expectNoReload(page);

  // Clear resets the URL and shows all tasks; data was never modified.
  await page.getByRole("button", { name: "Clear" }).click();
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByTestId("task-card")).toHaveCount(4);
});

test("concurrent edit of the same field: local change is protected, then conflict is reported", async ({ browser }) => {
  const ctxA = await browser.newContext();
  const ctxB = await browser.newContext();
  const a = await ctxA.newPage();
  const b = await ctxB.newPage();
  await openBoard(a);
  await a.request.post("/api/tasks", { data: { title: "Shared task", status: "todo" } });
  await openBoard(b);
  await expect(card(a, "Shared task")).toBeVisible();

  // A starts editing the title.
  await card(a, "Shared task").click();
  await a.getByLabel("Title", { exact: true }).fill("Title from A");

  // B renames the same task and saves first.
  await card(b, "Shared task").click();
  await b.getByLabel("Title", { exact: true }).fill("Title from B");
  await b.getByRole("button", { name: "Save" }).click();

  // A's in-progress edit is not overwritten; A is warned.
  await expect(a.getByLabel("Title", { exact: true })).toHaveValue("Title from A");
  await expect(a.getByText("Someone else changed this")).toBeVisible();

  // A saves anyway: server rejects with 409, A ends up on B's version.
  await a.getByRole("button", { name: "Save" }).click();
  await expect(a.getByRole("alert")).toContainText("changed by someone else");
  await expect(card(column(a, "Todo"), "Title from B")).toBeVisible();
  await expect(card(column(b, "Todo"), "Title from B")).toBeVisible();
  await ctxA.close();
  await ctxB.close();
});

test("remote delete removes the task for other clients and closes their drawer gracefully", async ({ browser }) => {
  const ctxA = await browser.newContext();
  const ctxB = await browser.newContext();
  const a = await ctxA.newPage();
  const b = await ctxB.newPage();
  await openBoard(a);
  await a.request.post("/api/tasks", { data: { title: "To be deleted", status: "backlog" } });
  await openBoard(b);
  await card(b, "To be deleted").click();

  await card(a, "To be deleted").click();
  await a.getByRole("button", { name: "Delete", exact: true }).click();
  await a.getByRole("button", { name: "Delete", exact: true }).click();
  await expect(card(a, "To be deleted")).toHaveCount(0);
  await expect(b.getByText("This task was deleted")).toBeVisible();
  await expect(card(b, "To be deleted")).toHaveCount(0);
  await ctxA.close();
  await ctxB.close();
});
