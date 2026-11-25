import type { Response } from "express";
import type { HelloEvent, PresenceEvent, TaskEvent } from "@kanban/shared";
import { randomUUID } from "node:crypto";

type Connection = { id: string; clientId: string; res: Response };

/**
 * In-process SSE broadcaster.
 *
 * - Keeps a bounded ring buffer of recent task events so a reconnecting client
 *   that sends Last-Event-ID can be replayed what it missed.
 * - If the gap is older than the buffer, the client is told to `resync`
 *   (refetch the board) instead of silently missing events.
 *
 * Single-instance by design (see README: horizontal scaling would need a
 * shared bus such as Postgres LISTEN/NOTIFY or Redis).
 */
export class EventHub {
  private readonly connections = new Map<string, Connection>();
  private readonly buffer: TaskEvent[] = [];
  private heartbeat: NodeJS.Timeout | undefined;

  constructor(
    private readonly opts: { heartbeatMs: number; bufferSize?: number } = { heartbeatMs: 15_000 },
  ) {}

  get size(): number {
    return this.connections.size;
  }

  start(): void {
    if (this.heartbeat) return;
    this.heartbeat = setInterval(() => {
      for (const c of this.connections.values()) this.write(c, `: ping ${Date.now()}\n\n`);
    }, this.opts.heartbeatMs);
    this.heartbeat.unref();
  }

  stop(): void {
    if (this.heartbeat) clearInterval(this.heartbeat);
    this.heartbeat = undefined;
    for (const c of this.connections.values()) c.res.end();
    this.connections.clear();
  }

  /**
   * Attach an SSE response. `lastEventId` is the revision the client last saw.
   */
  connect(res: Response, opts: { clientId: string; lastEventId?: number; revision: number }): () => void {
    const conn: Connection = { id: randomUUID(), clientId: opts.clientId, res };

    res.status(200);
    res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
    res.setHeader("Cache-Control", "no-cache, no-transform");
    res.setHeader("Connection", "keep-alive");
    // Disable proxy buffering (nginx / Render / Fly) so events flush immediately.
    res.setHeader("X-Accel-Buffering", "no");
    res.flushHeaders();
    res.write(`retry: 3000\n\n`);

    this.connections.set(conn.id, conn);

    const hello: HelloEvent = {
      clientId: opts.clientId,
      revision: opts.revision,
      connections: this.connections.size,
    };
    this.write(conn, frame("hello", hello));

    if (opts.lastEventId !== undefined && Number.isFinite(opts.lastEventId)) {
      this.replay(conn, opts.lastEventId, opts.revision);
    }

    this.broadcastPresence();

    let closed = false;
    return () => {
      if (closed) return;
      closed = true;
      this.connections.delete(conn.id);
      this.broadcastPresence();
    };
  }

  /** Broadcast a committed task event. Must only be called after a successful commit. */
  publish(event: TaskEvent): void {
    this.buffer.push(event);
    const max = this.opts.bufferSize ?? 500;
    if (this.buffer.length > max) this.buffer.splice(0, this.buffer.length - max);
    const data = frame(event.type, event, event.revision);
    for (const c of this.connections.values()) this.write(c, data);
  }

  private replay(conn: Connection, lastEventId: number, currentRevision: number): void {
    if (lastEventId >= currentRevision) return;
    const oldest = this.buffer[0]?.revision;
    // Revisions are contiguous; if lastEventId+1 isn't buffered we can't replay reliably.
    const missed = this.buffer.filter((e) => e.revision > lastEventId);
    const contiguous = oldest !== undefined && oldest <= lastEventId + 1;
    if (!contiguous) {
      this.write(conn, frame("resync", { reason: "gap", revision: currentRevision }));
      return;
    }
    for (const e of missed) this.write(conn, frame(e.type, e, e.revision));
  }

  private broadcastPresence(): void {
    const payload: PresenceEvent = { connections: this.connections.size };
    const data = frame("presence", payload);
    for (const c of this.connections.values()) this.write(c, data);
  }

  private write(conn: Connection, data: string): void {
    try {
      conn.res.write(data);
    } catch {
      this.connections.delete(conn.id);
    }
  }
}

/** Serialise one SSE frame. JSON never contains raw newlines, so one data: line is safe. */
export function frame(event: string, data: unknown, id?: number): string {
  return `${id !== undefined ? `id: ${id}\n` : ""}event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}
