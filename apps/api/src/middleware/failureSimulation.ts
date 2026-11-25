import type { RequestHandler } from "express";
import { HEADER_SIMULATE_FAILURE, type ApiError } from "@kanban/shared";
import type { Config } from "../lib/config.js";

/**
 * Development/demo failure injection for write requests.
 * Fails BEFORE any database work, so nothing is committed or broadcast.
 * Disabled unless FAILURE_SIMULATION is enabled (default: on in dev, off in prod).
 */
export function failureSimulation(
  config: Pick<Config, "failureSimulation" | "failureRate" | "latencyMs">,
): RequestHandler {
  return async (req, res, next) => {
    if (req.method === "GET" || req.method === "OPTIONS") return next();
    if (config.latencyMs > 0) await new Promise((r) => setTimeout(r, config.latencyMs));
    if (!config.failureSimulation) return next();
    const forced = req.header(HEADER_SIMULATE_FAILURE) === "1";
    const random = config.failureRate > 0 && Math.random() < config.failureRate;
    if (!forced && !random) return next();
    const body: ApiError = {
      error: { code: "SIMULATED_FAILURE", message: "The server failed to process this request (simulated failure)." },
    };
    res.status(503).json(body);
  };
}
