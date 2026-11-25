import { isPriority, STATUSES, type Priority, type Task } from "@kanban/shared";
import type { Columns } from "../board/boardState";

export type Filters = {
  search: string;
  priority: Priority | "";
  assignee: string;
};

export const EMPTY_FILTERS: Filters = { search: "", priority: "", assignee: "" };

/** Special assignee filter value for tasks with no assignee. */
export const UNASSIGNED = "__unassigned";

export function parseFilters(search: string): Filters {
  const params = new URLSearchParams(search);
  const priority = params.get("priority") ?? "";
  return {
    search: params.get("search") ?? "",
    priority: isPriority(priority) ? priority : "",
    assignee: (params.get("assignee") ?? "").trim(),
  };
}

/**
 * Serialise filters into a query string, preserving unrelated params.
 * Empty values are omitted, so a clean board has a clean URL.
 */
export function serializeFilters(filters: Filters, existing = ""): string {
  const params = new URLSearchParams(existing);
  const set = (key: string, value: string) => (value ? params.set(key, value) : params.delete(key));
  set("search", filters.search.trim() ? filters.search : "");
  set("priority", filters.priority);
  set("assignee", filters.assignee);
  const qs = params.toString();
  return qs ? `?${qs}` : "";
}

export function isFiltering(f: Filters): boolean {
  return f.search.trim() !== "" || f.priority !== "" || f.assignee !== "";
}

export function matchesFilters(task: Task, f: Filters): boolean {
  const q = f.search.trim().toLowerCase();
  if (q && !task.title.toLowerCase().includes(q)) return false;
  if (f.priority && task.priority !== f.priority) return false;
  if (f.assignee) {
    if (f.assignee === UNASSIGNED) return task.assignee.trim() === "";
    if (task.assignee.trim().toLowerCase() !== f.assignee.toLowerCase()) return false;
  }
  return true;
}

/** Returns new arrays; the underlying board data is never modified. */
export function filterColumns(columns: Columns, f: Filters): Columns {
  if (!isFiltering(f)) return columns;
  const out = {} as Columns;
  for (const s of STATUSES) out[s] = columns[s].filter((t) => matchesFilters(t, f));
  return out;
}

/** Distinct assignees (case-insensitive), sorted, with original casing of first occurrence. */
export function collectAssignees(columns: Columns): string[] {
  const seen = new Map<string, string>();
  for (const s of STATUSES) {
    for (const t of columns[s]) {
      const name = t.assignee.trim();
      if (name && !seen.has(name.toLowerCase())) seen.set(name.toLowerCase(), name);
    }
  }
  return [...seen.values()].sort((a, b) => a.localeCompare(b));
}
