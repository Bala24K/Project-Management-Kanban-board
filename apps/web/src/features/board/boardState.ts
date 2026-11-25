import {
  STATUSES,
  type BoardResponse,
  type ColumnOrder,
  type EditableField,
  type Status,
  type Task,
  type TaskEvent,
} from "@kanban/shared";

/* ==================================================================
 * Board state = CONFIRMED layer (server truth) + PENDING mutation queue.
 *
 *   view = replay(pending, on top of confirmed)
 *
 * - Optimistic update  -> push a mutation onto `pending`.
 * - Success            -> fold the server result into `confirmed`, drop the mutation.
 * - Failure (rollback) -> drop the mutation. Nothing else is touched, so an older
 *                         failure can never undo a newer mutation or a remote change.
 * - Remote SSE event   -> fold into `confirmed` only. Pending local mutations are
 *                         re-applied on top, so they are never overwritten.
 * Staleness: per-task `revision`, per-column order revision, and tombstones for
 * deleted ids (a late event can never resurrect a deleted task).
 * ================================================================== */

export type TaskChanges = Partial<Pick<Task, EditableField>>;

export type Mutation =
  | { id: string; kind: "create"; taskId: string; task: Task }
  | {
      id: string;
      kind: "update";
      taskId: string;
      changes: TaskChanges;
      /** Target index in the destination column (full, unfiltered). */
      position?: number;
    }
  | { id: string; kind: "delete"; taskId: string };

export type BoardState = {
  phase: "loading" | "ready" | "error";
  loadError: string | null;
  boardTitle: string;
  confirmed: Record<string, Task>;
  /** Board revision of the last full snapshot. Events at or below it are already included. */
  baseRevision: number;
  /** Revision of the order snapshot last applied per column. */
  columnRevision: Record<Status, number>;
  /** Ids deleted on the server. Never re-added. */
  tombstones: Record<string, true>;
  pending: Mutation[];
};

/** A committed server change: a mutation response or an SSE event. */
export type ServerChange = {
  revision: number;
  order: ColumnOrder;
  task?: Task;
  deletedId?: string;
};

export type BoardAction =
  | { type: "loadFailed"; error: string }
  | { type: "snapshot"; board: BoardResponse }
  | { type: "mutationStarted"; mutation: Mutation }
  | { type: "mutationSucceeded"; mutationId: string; change: ServerChange }
  | { type: "mutationFailed"; mutationId: string; current?: Task; deletedId?: string }
  | { type: "remoteEvent"; event: TaskEvent };

const zeroColumns = (n: number): Record<Status, number> => ({ backlog: n, todo: n, in_progress: n, done: n });

export const initialBoardState: BoardState = {
  phase: "loading",
  loadError: null,
  boardTitle: "",
  confirmed: {},
  baseRevision: -1,
  columnRevision: zeroColumns(-1),
  tombstones: {},
  pending: [],
};

export function boardReducer(state: BoardState, action: BoardAction): BoardState {
  switch (action.type) {
    case "loadFailed":
      return state.phase === "ready" ? state : { ...state, phase: "error", loadError: action.error };

    case "snapshot": {
      const { board } = action;
      const confirmed: Record<string, Task> = {};
      for (const t of board.tasks) if (!state.tombstones[t.id]) confirmed[t.id] = t;
      return {
        ...state,
        phase: "ready",
        loadError: null,
        boardTitle: board.board.title,
        confirmed,
        baseRevision: board.revision,
        columnRevision: zeroColumns(board.revision),
        // Pending mutations survive a resync: they are re-applied on top.
      };
    }

    case "mutationStarted":
      return { ...state, pending: [...state.pending, action.mutation] };

    case "mutationSucceeded": {
      const next = applyServerChange(state, action.change);
      return { ...next, pending: next.pending.filter((m) => m.id !== action.mutationId) };
    }

    case "mutationFailed": {
      let next: BoardState = { ...state, pending: state.pending.filter((m) => m.id !== action.mutationId) };
      // 409: the server told us its current version - adopt it if it's newer.
      if (action.current) next = applyTask(next, action.current);
      // 404: the task no longer exists on the server.
      if (action.deletedId) next = applyDeletion(next, action.deletedId);
      return next;
    }

    case "remoteEvent": {
      const e = action.event;
      return applyServerChange(state, {
        revision: e.revision,
        order: e.order,
        task: e.type === "task.deleted" ? undefined : e.task,
        deletedId: e.type === "task.deleted" ? e.taskId : undefined,
      });
    }
  }
}

/**
 * Fold a committed change into the confirmed layer. Idempotent and order-tolerant:
 * applying the same change twice (own SSE echo + HTTP response) is a no-op, and
 * an older change arriving after a newer one is ignored.
 */
export function applyServerChange(state: BoardState, change: ServerChange): BoardState {
  let next = state;
  // Deletion is final and ids are never reused, so it is safe at any revision.
  if (change.deletedId) next = applyDeletion(next, change.deletedId);
  // Already reflected in the last full snapshot.
  if (change.revision <= state.baseRevision) return next;
  if (change.task) next = applyTask(next, change.task);
  return applyOrder(next, change.order, change.revision);
}

function applyTask(state: BoardState, task: Task): BoardState {
  if (state.tombstones[task.id]) return state;
  const existing = state.confirmed[task.id];
  if (existing && existing.revision >= task.revision) return state;
  let incoming = task;
  // A newer order snapshot for this column already placed the task; keep that position.
  if (existing && existing.status === task.status && state.columnRevision[task.status] > task.revision) {
    incoming = { ...task, position: existing.position };
  }
  return { ...state, confirmed: { ...state.confirmed, [task.id]: incoming } };
}

function applyDeletion(state: BoardState, id: string): BoardState {
  if (state.tombstones[id] && !state.confirmed[id]) return state;
  const confirmed = { ...state.confirmed };
  delete confirmed[id];
  return { ...state, confirmed, tombstones: { ...state.tombstones, [id]: true } };
}

function applyOrder(state: BoardState, order: ColumnOrder, revision: number): BoardState {
  let confirmed = state.confirmed;
  let columnRevision = state.columnRevision;
  for (const status of STATUSES) {
    const ids = order[status];
    if (!ids || revision <= columnRevision[status]) continue;
    if (confirmed === state.confirmed) confirmed = { ...confirmed };
    ids.forEach((id, index) => {
      const t = confirmed[id];
      // Only reposition tasks whose own data is not newer than this snapshot.
      if (t && t.revision <= revision && (t.position !== index || t.status !== status)) {
        confirmed[id] = { ...t, status, position: index };
      }
    });
    columnRevision = { ...columnRevision, [status]: revision };
  }
  return confirmed === state.confirmed && columnRevision === state.columnRevision
    ? state
    : { ...state, confirmed, columnRevision };
}

/* ------------------------------------------------------------------ */
/* View derivation                                                     */
/* ------------------------------------------------------------------ */

export type Columns = Record<Status, Task[]>;

export function emptyColumns(): Columns {
  return { backlog: [], todo: [], in_progress: [], done: [] };
}

export function groupConfirmed(confirmed: Record<string, Task>): Columns {
  const cols = emptyColumns();
  for (const t of Object.values(confirmed)) cols[t.status].push(t);
  for (const s of STATUSES) {
    cols[s].sort((a, b) => a.position - b.position || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  }
  return cols;
}

/** Replay pending mutations on top of the confirmed layer. Positions are renumbered. */
export function deriveColumns(state: Pick<BoardState, "confirmed" | "pending">): Columns {
  let cols = groupConfirmed(state.confirmed);
  for (const m of state.pending) cols = applyMutation(cols, m);
  for (const s of STATUSES) {
    cols[s] = cols[s].map((t, i) => (t.position === i ? t : { ...t, position: i }));
  }
  return cols;
}

function locate(cols: Columns, id: string): { status: Status; index: number } | null {
  for (const s of STATUSES) {
    const index = cols[s].findIndex((t) => t.id === id);
    if (index >= 0) return { status: s, index };
  }
  return null;
}

export function applyMutation(cols: Columns, m: Mutation): Columns {
  const at = locate(cols, m.taskId);
  const next: Columns = { ...cols };
  switch (m.kind) {
    case "create": {
      if (at) next[at.status] = next[at.status].filter((t) => t.id !== m.taskId);
      const col = [...next[m.task.status]];
      col.splice(clamp(m.task.position, 0, col.length), 0, m.task);
      next[m.task.status] = col;
      return next;
    }
    case "update": {
      // Deleted remotely (or never created): never resurrect it.
      if (!at) return cols;
      const current = cols[at.status][at.index]!;
      const updated: Task = { ...current, ...m.changes };
      const toStatus = updated.status;
      const moving = toStatus !== at.status || m.position !== undefined;
      if (!moving) {
        const col = [...next[at.status]];
        col[at.index] = updated;
        next[at.status] = col;
        return next;
      }
      const source = next[at.status].filter((t) => t.id !== m.taskId);
      next[at.status] = source;
      const dest = toStatus === at.status ? [...source] : [...next[toStatus]];
      const fallback = toStatus === at.status ? at.index : dest.length;
      dest.splice(clamp(m.position ?? fallback, 0, dest.length), 0, updated);
      next[toStatus] = dest;
      return next;
    }
    case "delete": {
      if (!at) return cols;
      next[at.status] = next[at.status].filter((t) => t.id !== m.taskId);
      return next;
    }
  }
}

export function hasPendingMutation(state: Pick<BoardState, "pending">, taskId: string): boolean {
  return state.pending.some((m) => m.taskId === taskId);
}

function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n));
}
