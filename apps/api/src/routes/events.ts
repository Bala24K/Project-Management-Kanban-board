import { Router } from "express";
import { randomUUID } from "node:crypto";
import type { EventHub } from "../events/hub.js";
import type { TaskService } from "../services/taskService.js";
import { isSafeId } from "../middleware/requestContext.js";

export function eventsRouter(service: TaskService, hub: EventHub): Router {
  const router = Router();
  router.get("/events", async (req, res) => {
    const clientId = isSafeId(req.query.clientId) ? req.query.clientId : randomUUID();
    const rawLast =
      req.header("last-event-id") ?? (typeof req.query.lastEventId === "string" ? req.query.lastEventId : undefined);
    const parsed = rawLast ? Number(rawLast) : NaN;
    const lastEventId = Number.isInteger(parsed) && parsed >= 0 ? parsed : undefined;
    const revision = await service.currentRevision();
    if (req.destroyed) return;
    const disconnect = hub.connect(res, { clientId, lastEventId, revision });
    // res "close" fires when the client goes away (tab closed, network drop, abort).
    res.on("close", disconnect);
    res.on("error", disconnect);
  });
  return router;
}
