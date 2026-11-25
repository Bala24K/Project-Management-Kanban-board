import type { HelloEvent, PresenceEvent, TaskEvent } from "@kanban/shared";
import { apiUrl } from "../../lib/api";
import { getClientId } from "../../lib/clientId";

export type ConnectionState = "connecting" | "live" | "reconnecting";

export type EventStreamHandlers = {
  onHello: (e: HelloEvent) => void;
  onTaskEvent: (e: TaskEvent) => void;
  onResync: () => void;
  onPresence: (e: PresenceEvent) => void;
  onState: (s: ConnectionState) => void;
};

const TASK_EVENTS = ["task.created", "task.updated", "task.deleted"] as const;

/**
 * Wraps EventSource. The browser reconnects by itself and sends Last-Event-ID,
 * so the server can replay missed events. If the browser gives up (readyState
 * CLOSED, e.g. the server answered with an error), we recreate the stream with
 * exponential backoff and pass the last seen id explicitly.
 */
export function openEventStream(handlers: EventStreamHandlers): () => void {
  let es: EventSource | null = null;
  let lastEventId: string | null = null;
  let retryTimer: ReturnType<typeof setTimeout> | undefined;
  let attempts = 0;
  let closed = false;

  const connect = () => {
    const params = new URLSearchParams({ clientId: getClientId() });
    if (lastEventId) params.set("lastEventId", lastEventId);
    es = new EventSource(apiUrl(`/api/events?${params.toString()}`));
    handlers.onState(attempts === 0 ? "connecting" : "reconnecting");

    es.onopen = () => {
      attempts = 0;
      handlers.onState("live");
    };
    es.onerror = () => {
      if (closed || !es) return;
      if (es.readyState === EventSource.CLOSED) {
        es.close();
        attempts += 1;
        handlers.onState("reconnecting");
        const delay = Math.min(30_000, 1000 * 2 ** Math.min(attempts, 5));
        retryTimer = setTimeout(connect, delay);
      } else {
        handlers.onState("reconnecting");
      }
    };

    es.addEventListener("hello", (msg) => {
      handlers.onState("live");
      handlers.onHello(JSON.parse((msg as MessageEvent<string>).data) as HelloEvent);
    });
    es.addEventListener("presence", (msg) => {
      handlers.onPresence(JSON.parse((msg as MessageEvent<string>).data) as PresenceEvent);
    });
    es.addEventListener("resync", () => handlers.onResync());
    for (const type of TASK_EVENTS) {
      es.addEventListener(type, (msg) => {
        const m = msg as MessageEvent<string>;
        if (m.lastEventId) lastEventId = m.lastEventId;
        try {
          handlers.onTaskEvent(JSON.parse(m.data) as TaskEvent);
        } catch (err) {
          console.error("[events] bad event payload", err);
        }
      });
    }
  };

  connect();

  return () => {
    closed = true;
    clearTimeout(retryTimer);
    es?.close();
  };
}
