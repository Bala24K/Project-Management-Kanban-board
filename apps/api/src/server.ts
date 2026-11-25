import { createApp } from "./app.js";
import { loadConfig } from "./lib/config.js";
import { prisma } from "./lib/prisma.js";
import { EventHub } from "./events/hub.js";
import { TaskService } from "./services/taskService.js";

const config = loadConfig();
const service = new TaskService(prisma);
const hub = new EventHub({ heartbeatMs: config.heartbeatMs });

await service.ensureBoard();
hub.start();

const app = createApp({ service, hub, config });
const server = app.listen(config.port, () => {
  console.log(`[api] listening on :${config.port} (failure simulation: ${config.failureSimulation ? "on" : "off"})`);
});

function shutdown(signal: string) {
  console.log(`[api] ${signal} received, shutting down`);
  hub.stop();
  server.close(() => {
    void prisma.$disconnect().finally(() => process.exit(0));
  });
  setTimeout(() => process.exit(0), 5000).unref();
}
process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
