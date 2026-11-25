import { z } from "zod";

/* ------------------------------------------------------------------ */
/* Columns                                                             */
/* ------------------------------------------------------------------ */

/** The four board columns, in display order. Never reorder this array. */
export const STATUSES = ["backlog", "todo", "in_progress", "done"] as const;
export type Status = (typeof STATUSES)[number];

export const STATUS_LABELS: Record<Status, string> = {
  backlog: "Backlog",
  todo: "Todo",
  in_progress: "In Progress",
  done: "Done",
};

export const PRIORITIES = ["low", "medium", "high"] as const;
export type Priority = (typeof PRIORITIES)[number];

export const PRIORITY_LABELS: Record<Priority, string> = {
  low: "Low",
  medium: "Medium",
  high: "High",
};

/* ------------------------------------------------------------------ */
/* Task                                                                */
/* ------------------------------------------------------------------ */

export type Task = {
  id: string;
  title: string;
  description: string;
  priority: Priority;
  assignee: string;
  /** Column the task belongs to. */
  status: Status;
  /** 0-based order within the column. Dense: 0..n-1. */
  position: number;
  /** ISO timestamp of the last explicit modification of this task. */
  updatedAt: string;
  createdAt: string;
  /**
   * Board revision at which this task was last explicitly modified.
   * Monotonic; used by clients to discard stale events.
   */
  revision: number;
};

export const TITLE_MAX = 200;
export const DESCRIPTION_MAX = 5000;
export const ASSIGNEE_MAX = 60;

const title = z.string().trim().min(1, "Title is required").max(TITLE_MAX);
const description = z.string().max(DESCRIPTION_MAX);
const assignee = z.string().trim().max(ASSIGNEE_MAX);
const priority = z.enum(PRIORITIES);
const status = z.enum(STATUSES);
const position = z.number().int().min(0).max(100_000);

export const createTaskSchema = z.strictObject({
  /** Optional client-generated id, so optimistic tasks keep a stable id. */
  id: z.uuid().optional(),
  title,
  description: description.default(""),
  priority: priority.default("medium"),
  assignee: assignee.default(""),
  status: status.default("backlog"),
  /** Index within the destination column. Defaults to the end. */
  position: position.optional(),
});
export type CreateTaskInput = z.input<typeof createTaskSchema>;

/** Fields that may be compare-and-set checked on update. */
export const EDITABLE_FIELDS = ["title", "description", "priority", "assignee", "status"] as const;
export type EditableField = (typeof EDITABLE_FIELDS)[number];

export const updateTaskSchema = z
  .strictObject({
    title: title.optional(),
    description: description.optional(),
    priority: priority.optional(),
    assignee: assignee.optional(),
    status: status.optional(),
    /** Target index within the (possibly new) column. */
    position: position.optional(),
    /**
     * Field-level compare-and-set. For each field listed, the value the client
     * based its edit on. If the server's current value differs from both this
     * base value and the requested value, the update is rejected with 409.
     */
    expected: z
      .strictObject({
        title: z.string().optional(),
        description: z.string().optional(),
        priority: priority.optional(),
        assignee: z.string().optional(),
        status: status.optional(),
      })
      .optional(),
  })
  .refine(
    (v) => EDITABLE_FIELDS.some((f) => v[f] !== undefined) || v.position !== undefined,
    { message: "At least one field must be provided" },
  );
export type UpdateTaskInput = z.input<typeof updateTaskSchema>;

/* ------------------------------------------------------------------ */
/* API payloads                                                        */
/* ------------------------------------------------------------------ */

/** Ordered task ids of a column at a given board revision. */
export type ColumnOrder = Partial<Record<Status, string[]>>;

export type BoardResponse = {
  board: { id: string; title: string };
  tasks: Task[];
  /** Board revision this snapshot reflects. */
  revision: number;
};

export type MutationResponse = {
  task: Task;
  /** Authoritative ordering of the columns touched by this mutation. */
  order: ColumnOrder;
  revision: number;
};

export type DeleteResponse = {
  id: string;
  order: ColumnOrder;
  revision: number;
};

export type ApiErrorCode =
  | "VALIDATION_ERROR"
  | "NOT_FOUND"
  | "CONFLICT"
  | "SIMULATED_FAILURE"
  | "INTERNAL_ERROR";

export type ApiError = {
  error: {
    code: ApiErrorCode;
    message: string;
    details?: unknown;
    /** For CONFLICT: the current server version of the task. */
    current?: Task;
  };
};

/* ------------------------------------------------------------------ */
/* Server-Sent Events                                                  */
/* ------------------------------------------------------------------ */

type EventBase = {
  /** Board revision produced by the commit; also the SSE event id. */
  revision: number;
  taskId: string;
  /** Server timestamp (ISO). */
  timestamp: string;
  /** Client that originated the mutation, if known. */
  clientId: string | null;
  /** Client-generated mutation id, if provided. */
  mutationId: string | null;
  order: ColumnOrder;
};

export type TaskCreatedEvent = EventBase & { type: "task.created"; task: Task };
export type TaskUpdatedEvent = EventBase & { type: "task.updated"; task: Task };
export type TaskDeletedEvent = EventBase & { type: "task.deleted" };

export type TaskEvent = TaskCreatedEvent | TaskUpdatedEvent | TaskDeletedEvent;
export type TaskEventType = TaskEvent["type"];

export type HelloEvent = { clientId: string; revision: number; connections: number };
export type PresenceEvent = { connections: number };

/* ------------------------------------------------------------------ */
/* Headers                                                             */
/* ------------------------------------------------------------------ */

export const HEADER_CLIENT_ID = "x-client-id";
export const HEADER_MUTATION_ID = "x-mutation-id";
export const HEADER_SIMULATE_FAILURE = "x-simulate-failure";

export function isStatus(v: unknown): v is Status {
  return typeof v === "string" && (STATUSES as readonly string[]).includes(v);
}

export function isPriority(v: unknown): v is Priority {
  return typeof v === "string" && (PRIORITIES as readonly string[]).includes(v);
}
