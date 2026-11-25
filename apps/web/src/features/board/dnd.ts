import { STATUSES, isStatus, type Status, type Task } from "@kanban/shared";
import type { Columns } from "./boardState";

export const COLUMN_PREFIX = "column:";
export const columnDroppableId = (s: Status) => `${COLUMN_PREFIX}${s}`;

export function statusFromDroppable(id: string): Status | null {
  if (!id.startsWith(COLUMN_PREFIX)) return null;
  const s = id.slice(COLUMN_PREFIX.length);
  return isStatus(s) ? s : null;
}

export function findContainer(cols: Columns, id: string): Status | null {
  const asColumn = statusFromDroppable(id);
  if (asColumn) return asColumn;
  for (const s of STATUSES) if (cols[s].some((t) => t.id === id)) return s;
  return null;
}

/** Move `activeId` into `to` at `index` (preview only; no network). */
export function moveBetween(cols: Columns, activeId: string, to: Status, index: number): Columns {
  const from = findContainer(cols, activeId);
  if (!from) return cols;
  const task = cols[from].find((t) => t.id === activeId)!;
  const next: Columns = { ...cols, [from]: cols[from].filter((t) => t.id !== activeId) };
  const dest = [...next[to]];
  dest.splice(Math.min(Math.max(index, 0), dest.length), 0, { ...task, status: to });
  next[to] = dest;
  return next;
}

/**
 * Translate a drop position in the (possibly filtered) visible column into an
 * index in the full column. The task is placed right after its visible
 * predecessor, or right before its visible successor, or at the end.
 */
export function toFullIndex(fullColumn: Task[], visibleColumn: Task[], taskId: string): number {
  const i = visibleColumn.findIndex((t) => t.id === taskId);
  const rest = fullColumn.filter((t) => t.id !== taskId);
  if (i < 0) return rest.length;
  const prev = visibleColumn[i - 1];
  if (prev) {
    const pi = rest.findIndex((t) => t.id === prev.id);
    if (pi >= 0) return pi + 1;
  }
  const next = visibleColumn[i + 1];
  if (next) {
    const ni = rest.findIndex((t) => t.id === next.id);
    if (ni >= 0) return ni;
  }
  return rest.length;
}
