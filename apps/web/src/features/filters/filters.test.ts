import { describe, expect, it } from "vitest";
import type { Status, Task } from "@kanban/shared";
import { collectAssignees, filterColumns, parseFilters, serializeFilters, UNASSIGNED } from "./filters";
import { emptyColumns, type Columns } from "../board/boardState";
import { moveBetween, toFullIndex } from "../board/dnd";

const t = (id: string, title: string, priority: Task["priority"], assignee: string, status: Status = "todo"): Task => ({
  id,
  title,
  description: "",
  priority,
  assignee,
  status,
  position: 0,
  revision: 1,
  createdAt: "",
  updatedAt: "",
});

function cols(tasks: Task[]): Columns {
  const c = emptyColumns();
  for (const x of tasks) c[x.status].push(x);
  return c;
}

const board = cols([
  t("1", "Payment retry", "high", "Alex"),
  t("2", "Payment page copy", "low", "Priya", "done"),
  t("3", "Fix PAYMENT webhook", "high", "Priya"),
  t("4", "Dark mode", "low", ""),
]);
const titles = (c: Columns) => Object.values(c).flat().map((x) => x.title);

describe("filterColumns", () => {
  it("searches titles case-insensitively", () => {
    expect(titles(filterColumns(board, { search: "payment", priority: "", assignee: "" }))).toEqual([
      "Payment retry",
      "Fix PAYMENT webhook",
      "Payment page copy",
    ]);
  });

  it("combines search, priority and assignee (assignee case-insensitive)", () => {
    expect(titles(filterColumns(board, { search: "pay", priority: "high", assignee: "priya" }))).toEqual(["Fix PAYMENT webhook"]);
    expect(titles(filterColumns(board, { search: "pay", priority: "low", assignee: "alex" }))).toEqual([]);
  });

  it("filters unassigned tasks", () => {
    expect(titles(filterColumns(board, { search: "", priority: "", assignee: UNASSIGNED }))).toEqual(["Dark mode"]);
  });

  it("does not modify the underlying board", () => {
    const before = JSON.stringify(board);
    filterColumns(board, { search: "x", priority: "high", assignee: "Alex" });
    expect(JSON.stringify(board)).toBe(before);
    expect(filterColumns(board, { search: "  ", priority: "", assignee: "" })).toBe(board);
  });

  it("collects distinct assignees", () => {
    expect(collectAssignees(cols([t("1", "a", "low", "alex"), t("2", "b", "low", "Alex"), t("3", "c", "low", "Sam"), t("4", "d", "low", "")]))).toEqual([
      "alex",
      "Sam",
    ]);
  });
});

describe("URL query params", () => {
  it("parses search, priority and assignee", () => {
    expect(parseFilters("?search=payment&priority=high&assignee=alex")).toEqual({ search: "payment", priority: "high", assignee: "alex" });
  });

  it("ignores invalid priorities", () => {
    expect(parseFilters("?priority=urgent").priority).toBe("");
  });

  it("omits empty values and round-trips", () => {
    expect(serializeFilters({ search: "", priority: "", assignee: "" })).toBe("");
    const qs = serializeFilters({ search: "payment", priority: "high", assignee: "alex" });
    expect(qs).toBe("?search=payment&priority=high&assignee=alex");
    expect(parseFilters(qs)).toEqual({ search: "payment", priority: "high", assignee: "alex" });
  });

  it("encodes special characters and keeps unrelated params", () => {
    const qs = serializeFilters({ search: "a&b c", priority: "", assignee: "" }, "?foo=1&priority=low");
    expect(qs).toBe("?foo=1&search=a%26b+c");
    expect(parseFilters(qs).search).toBe("a&b c");
  });
});

describe("drag-and-drop index translation", () => {
  const full = ["a", "b", "c", "d", "e"].map((id) => t(id, id, "low", ""));
  const pick = (...ids: string[]) => ids.map((id) => full.find((x) => x.id === id)!);

  it("same index when not filtering", () => {
    // e moved between a and b
    expect(toFullIndex(full, pick("a", "e", "b", "c", "d"), "e")).toBe(1);
    // a moved to the end
    expect(toFullIndex(full, pick("b", "c", "d", "e", "a"), "a")).toBe(4);
  });

  it("places the task after its visible predecessor when filtered", () => {
    // Visible: b, d. User drops e between b and d -> right after b in the full list.
    expect(toFullIndex(full, pick("b", "e", "d"), "e")).toBe(2);
    // Dropped first in the visible list -> right before d (its successor).
    expect(toFullIndex(full, pick("e", "d"), "e")).toBe(3);
  });

  it("appends when the column has no visible neighbours", () => {
    expect(toFullIndex(full, pick("e"), "e")).toBe(4);
  });

  it("moveBetween previews a cross-column move without mutating input", () => {
    const c = cols([t("x", "x", "low", "", "todo"), t("y", "y", "low", "", "done")]);
    const next = moveBetween(c, "x", "done", 0);
    expect(next.done.map((z) => z.id)).toEqual(["x", "y"]);
    expect(next.todo).toEqual([]);
    expect(c.todo.map((z) => z.id)).toEqual(["x"]);
  });
});
