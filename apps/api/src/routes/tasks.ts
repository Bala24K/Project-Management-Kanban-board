import { Router } from "express";
import { z } from "zod";
import type { TaskEvent } from "@kanban/shared";
import type { TaskService } from "../services/taskService.js";
import type { EventHub } from "../events/hub.js";
import { mutationContext } from "../middleware/requestContext.js";
import { notFound } from "../lib/errors.js";

const idParam = z.uuid();

type Unstamped<E> = E extends TaskEvent ? Omit<E, "timestamp"> : never;

/**
 * Routes are thin: call the service (which validates and commits), then
 * broadcast ONLY after it resolved, i.e. after the transaction committed.
 * A thrown error skips the broadcast and reaches the error handler.
 */
export function tasksRouter(service: TaskService, hub: EventHub): Router {
  const router = Router();

  const parseId = (raw: string) => {
    const r = idParam.safeParse(raw);
    if (!r.success) throw notFound("Task");
    return r.data;
  };

  const publish = (event: Unstamped<TaskEvent>) =>
    hub.publish({ ...event, timestamp: new Date().toISOString() } as TaskEvent);

  router.post("/tasks", async (req, res) => {
    const result = await service.create(req.body);
    publish({
      type: "task.created",
      taskId: result.task.id,
      task: result.task,
      order: result.order,
      revision: result.revision,
      ...mutationContext(req),
    });
    res.status(201).json(result);
  });

  router.patch("/tasks/:id", async (req, res) => {
    const result = await service.update(parseId(req.params.id), req.body);
    publish({
      type: "task.updated",
      taskId: result.task.id,
      task: result.task,
      order: result.order,
      revision: result.revision,
      ...mutationContext(req),
    });
    res.json(result);
  });

  router.delete("/tasks/:id", async (req, res) => {
    const result = await service.remove(parseId(req.params.id));
    publish({
      type: "task.deleted",
      taskId: result.id,
      order: result.order,
      revision: result.revision,
      ...mutationContext(req),
    });
    res.status(204).end();
  });

  return router;
}
