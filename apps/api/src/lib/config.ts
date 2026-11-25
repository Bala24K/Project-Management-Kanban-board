const isProduction = process.env.NODE_ENV === "production";

function bool(value: string | undefined, fallback: boolean): boolean {
  if (value === undefined || value === "") return fallback;
  return value === "true" || value === "1";
}

function num(value: string | undefined, fallback: number): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

export type Config = {
  port: number;
  isProduction: boolean;
  corsOrigins: string[];
  /** Honour the X-Simulate-Failure header (and FAILURE_RATE). */
  failureSimulation: boolean;
  /** Random failure probability for write requests, 0..1. */
  failureRate: number;
  /** Artificial latency for write requests, to make optimistic UI visible. */
  latencyMs: number;
  heartbeatMs: number;
  webDist: string | undefined;
};

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  return {
    port: num(env.PORT, 4000),
    isProduction,
    corsOrigins: (env.CORS_ORIGINS ?? "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean),
    failureSimulation: bool(env.FAILURE_SIMULATION, !isProduction),
    failureRate: Math.min(1, Math.max(0, num(env.FAILURE_RATE, 0))),
    latencyMs: Math.max(0, num(env.SIMULATED_LATENCY_MS, 0)),
    heartbeatMs: num(env.SSE_HEARTBEAT_MS, 15_000),
    webDist: env.WEB_DIST,
  };
}
