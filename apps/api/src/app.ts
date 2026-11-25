import express, { type Express } from "express";
import cors from "cors";
import fs from "node:fs";
import path from "node:path";
import type { Config } from "./lib/config.js";
import type { TaskService } from "./services/taskService.js";
import type { EventHub } from "./events/hub.js";
import { boardRouter } from "./routes/board.js";
import { tasksRouter } from "./routes/tasks.js";
import { eventsRouter } from "./routes/events.js";
import { failureSimulation } from "./middleware/failureSimulation.js";
import { errorHandler, notFoundHandler } from "./middleware/errorHandler.js";

export type AppDeps = { service: TaskService; hub: EventHub; config: Config };

export function createApp({ service, hub, config }: AppDeps): Express {
  const app = express();
  app.disable("x-powered-by");
  app.set("trust proxy", 1);

  if (config.corsOrigins.length > 0) {
    app.use("/api", cors({ origin: config.corsOrigins }));
  }
  app.use(express.json({ limit: "100kb" }));

  app.get("/api/health", (_req, res) => {
    res.json({ ok: true, connections: hub.size, failureSimulation: config.failureSimulation });
  });

  app.use("/api", failureSimulation(config));
  app.use("/api", boardRouter(service));
  app.use("/api", tasksRouter(service, hub));
  app.use("/api", eventsRouter(service, hub));
  app.use("/api", notFoundHandler);

  // Production: serve the built frontend from the same origin (no CORS needed).
  const webDist = config.webDist ?? path.resolve(import.meta.dirname, "../../web/dist");
  if (fs.existsSync(path.join(webDist, "index.html"))) {
    app.use(express.static(webDist, { index: false, maxAge: "1h" }));
    app.get("/{*splat}", (_req, res) => {
      res.setHeader("Cache-Control", "no-cache");
      res.sendFile(path.join(webDist, "index.html"));
    });
  }

  app.use(errorHandler);
  return app;
}
