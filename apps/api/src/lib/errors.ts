import type { ApiErrorCode, Task } from "@kanban/shared";

export class HttpError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: ApiErrorCode,
    message: string,
    public readonly details?: unknown,
    public readonly current?: Task,
  ) {
    super(message);
    this.name = "HttpError";
  }
}

export const notFound = (what: string) => new HttpError(404, "NOT_FOUND", `${what} not found`);
