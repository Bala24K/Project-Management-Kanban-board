import { Router } from "express";
import type { TaskService } from "../services/taskService.js";

export function boardRouter(service: TaskService): Router {
  const router = Router();
  router.get("/board", async (_req, res) => {
    res.setHeader("Cache-Control", "no-store");
    res.json(await service.getBoard());
  });
  return router;
}
