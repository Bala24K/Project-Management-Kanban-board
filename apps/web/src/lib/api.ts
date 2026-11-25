import {
  HEADER_CLIENT_ID,
  HEADER_MUTATION_ID,
  HEADER_SIMULATE_FAILURE,
  type ApiError,
  type ApiErrorCode,
  type BoardResponse,
  type CreateTaskInput,
  type MutationResponse,
  type Task,
  type UpdateTaskInput,
} from "@kanban/shared";
import { getClientId } from "./clientId";

export class ApiRequestError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: ApiErrorCode | "NETWORK_ERROR",
    message: string,
    public readonly current?: Task,
  ) {
    super(message);
    this.name = "ApiRequestError";
  }
}

/** Dev/demo switch: when on, every write asks the server to fail (X-Simulate-Failure). */
let simulateFailures = false;
export function setSimulateFailures(on: boolean): void {
  simulateFailures = on;
}
export function getSimulateFailures(): boolean {
  return simulateFailures;
}

const API_BASE = (import.meta.env.VITE_API_URL as string | undefined)?.replace(/\/$/, "") ?? "";

export function apiUrl(path: string): string {
  return `${API_BASE}${path}`;
}

async function request<T>(path: string, init: RequestInit & { mutationId?: string } = {}): Promise<T> {
  const headers = new Headers(init.headers);
  headers.set(HEADER_CLIENT_ID, getClientId());
  if (init.body !== undefined) headers.set("content-type", "application/json");
  if (init.mutationId) headers.set(HEADER_MUTATION_ID, init.mutationId);
  if (simulateFailures && init.method && init.method !== "GET") headers.set(HEADER_SIMULATE_FAILURE, "1");

  let res: Response;
  try {
    res = await fetch(apiUrl(path), { ...init, headers });
  } catch {
    throw new ApiRequestError(0, "NETWORK_ERROR", "Could not reach the server. Check your connection.");
  }
  if (res.status === 204) return undefined as T;
  const body = (await res.json().catch(() => null)) as unknown;
  if (!res.ok) {
    const err = (body as ApiError | null)?.error;
    throw new ApiRequestError(
      res.status,
      err?.code ?? "INTERNAL_ERROR",
      err?.message ?? `Request failed (${res.status})`,
      err?.current,
    );
  }
  return body as T;
}

export const api = {
  getBoard: () => request<BoardResponse>("/api/board"),
  createTask: (input: CreateTaskInput, mutationId: string) =>
    request<MutationResponse>("/api/tasks", { method: "POST", body: JSON.stringify(input), mutationId }),
  updateTask: (id: string, input: UpdateTaskInput, mutationId: string) =>
    request<MutationResponse>(`/api/tasks/${id}`, { method: "PATCH", body: JSON.stringify(input), mutationId }),
  deleteTask: (id: string, mutationId: string) =>
    request<void>(`/api/tasks/${id}`, { method: "DELETE", mutationId }),
  health: () => request<{ ok: boolean; failureSimulation: boolean }>("/api/health"),
};
