import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from "react";
import {
  EDITABLE_FIELDS,
  STATUS_LABELS,
  type Priority,
  type Status,
  type Task,
  type TaskEvent,
  type UpdateTaskInput,
} from "@kanban/shared";
import { api, ApiRequestError } from "../../lib/api";
import { uuid } from "../../lib/clientId";
import { useToast } from "../../components/Toasts";
import { openEventStream, type ConnectionState } from "../collaboration/eventStream";
import {
  boardReducer,
  deriveColumns,
  initialBoardState,
  type Columns,
  type Mutation,
  type ServerChange,
  type TaskChanges,
} from "./boardState";

export type NewTask = {
  title: string;
  description: string;
  priority: Priority;
  assignee: string;
  status: Status;
};

export type BoardApi = ReturnType<typeof useBoard>;

/**
 * Single owner of board state. Components call the intent methods below;
 * nothing else mutates board data.
 */
export function useBoard() {
  const [state, dispatch] = useReducer(boardReducer, initialBoardState);
  const columns = useMemo(() => deriveColumns(state), [state.confirmed, state.pending]);
  const toast = useToast();
  const [connection, setConnection] = useState<ConnectionState>("connecting");
  const [connections, setConnections] = useState<number | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  // Latest values for stable callbacks.
  const columnsRef = useRef<Columns>(columns);
  columnsRef.current = columns;

  /* ---------------- load + real-time stream ---------------- */

  useEffect(() => {
    let cancelled = false;
    let ready = false;
    let loading: Promise<void> | null = null;
    let buffered: TaskEvent[] = [];

    const load = () => {
      loading ??= api
        .getBoard()
        .then((board) => {
          if (cancelled) return;
          dispatch({ type: "snapshot", board });
          ready = true;
          // Events that arrived while the snapshot was in flight; the reducer
          // drops those already included (revision <= snapshot revision).
          for (const event of buffered) dispatch({ type: "remoteEvent", event });
          buffered = [];
        })
        .catch((err: unknown) => {
          if (cancelled) return;
          dispatch({ type: "loadFailed", error: err instanceof Error ? err.message : "Failed to load board" });
        })
        .finally(() => {
          loading = null;
        });
      return loading;
    };

    let helloSeen = false;
    const close = openEventStream({
      // Fetch the snapshot only after the stream is attached, so no commit can
      // fall between "snapshot read" and "subscribed".
      onHello: () => {
        if (!helloSeen) {
          helloSeen = true;
          void load();
        }
      },
      onTaskEvent: (event) => {
        if (ready) dispatch({ type: "remoteEvent", event });
        else buffered.push(event);
      },
      onResync: () => void load(),
      onPresence: (p) => setConnections(p.connections),
      onState: setConnection,
    });

    // If the stream can't connect at all, still show the board.
    const fallback = setTimeout(() => {
      if (!helloSeen) {
        helloSeen = true;
        void load();
      }
    }, 2500);

    return () => {
      cancelled = true;
      clearTimeout(fallback);
      close();
    };
  }, [reloadKey]);

  /* ---------------- mutation runner ---------------- */

  // Mutations on the same task are sent one at a time, in order.
  const queues = useRef(new Map<string, Promise<void>>());

  const run = useCallback(
    (mutation: Mutation, send: () => Promise<ServerChange>, describe: string) => {
      dispatch({ type: "mutationStarted", mutation });
      const prev = queues.current.get(mutation.taskId) ?? Promise.resolve();
      const job = prev.then(async () => {
        try {
          const change = await send();
          dispatch({ type: "mutationSucceeded", mutationId: mutation.id, change });
        } catch (err) {
          const e = err instanceof ApiRequestError ? err : null;
          const notFound = e?.status === 404 && mutation.kind !== "create";
          dispatch({
            type: "mutationFailed",
            mutationId: mutation.id,
            current: e?.code === "CONFLICT" ? e.current : undefined,
            deletedId: notFound ? mutation.taskId : undefined,
          });
          if (notFound && mutation.kind === "delete") return; // already gone: the desired outcome
          const reason = notFound ? "This task was deleted by someone else." : (e?.message ?? "Unexpected error.");
          toast.push("error", `Couldn't ${describe}`, `${reason} Your change was rolled back.`);
        }
      });
      queues.current.set(mutation.taskId, job);
      void job.finally(() => {
        if (queues.current.get(mutation.taskId) === job) queues.current.delete(mutation.taskId);
      });
      return job;
    },
    [toast],
  );

  /* ---------------- intents ---------------- */

  const createTask = useCallback(
    (input: NewTask) => {
      const id = uuid();
      const now = new Date().toISOString();
      const task: Task = {
        id,
        ...input,
        title: input.title.trim(),
        assignee: input.assignee.trim(),
        position: columnsRef.current[input.status].length,
        revision: 0,
        createdAt: now,
        updatedAt: now,
      };
      const mutationId = uuid();
      return run(
        { id: mutationId, kind: "create", taskId: id, task },
        async () => api.createTask({ id, ...input }, mutationId),
        `create "${task.title}"`,
      );
    },
    [run],
  );

  /** Edit fields. `base` holds the values the edit was based on (compare-and-set). */
  const updateTask = useCallback(
    (id: string, changes: TaskChanges, base: TaskChanges) => {
      const mutationId = uuid();
      const expected: UpdateTaskInput["expected"] = {};
      for (const f of EDITABLE_FIELDS) {
        if (changes[f] !== undefined && base[f] !== undefined) Object.assign(expected, { [f]: base[f] });
      }
      const title = findTask(columnsRef.current, id)?.title ?? "task";
      return run(
        { id: mutationId, kind: "update", taskId: id, changes },
        async () => api.updateTask(id, { ...changes, expected }, mutationId),
        `save "${title}"`,
      );
    },
    [run],
  );

  /** Drag-and-drop: move to `status` at `index` (index within the full, unfiltered column). */
  const moveTask = useCallback(
    (id: string, status: Status, index: number) => {
      const current = findTask(columnsRef.current, id);
      if (!current) return Promise.resolve();
      const currentIndex = columnsRef.current[current.status].findIndex((t) => t.id === id);
      if (current.status === status && currentIndex === index) return Promise.resolve();
      const mutationId = uuid();
      const changes: TaskChanges = status !== current.status ? { status } : {};
      return run(
        { id: mutationId, kind: "update", taskId: id, changes, position: index },
        async () => api.updateTask(id, { ...changes, position: index }, mutationId),
        `move "${current.title}" to ${STATUS_LABELS[status]}`,
      );
    },
    [run],
  );

  const deleteTask = useCallback(
    (id: string) => {
      const title = findTask(columnsRef.current, id)?.title ?? "task";
      const mutationId = uuid();
      return run(
        { id: mutationId, kind: "delete", taskId: id },
        async () => {
          await api.deleteTask(id, mutationId);
          // 204 has no body. Deletion is final, so the reducer applies it at any
          // revision; the SSE echo then supplies the authoritative column order.
          return { revision: 0, order: {}, deletedId: id };
        },
        `delete "${title}"`,
      );
    },
    [run],
  );

  const retryLoad = useCallback(() => setReloadKey((k) => k + 1), []);

  return {
    phase: state.phase,
    loadError: state.loadError,
    boardTitle: state.boardTitle,
    columns,
    pending: state.pending,
    connection,
    connections,
    createTask,
    updateTask,
    moveTask,
    deleteTask,
    retryLoad,
  };
}

export function findTask(columns: Columns, id: string): Task | undefined {
  for (const col of Object.values(columns)) {
    const t = col.find((x) => x.id === id);
    if (t) return t;
  }
  return undefined;
}
