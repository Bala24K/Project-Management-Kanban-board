import type { ErrorRequestHandler, RequestHandler } from "express";
import { ZodError } from "zod";
import { Prisma } from "@prisma/client";
import type { ApiError } from "@kanban/shared";
import { HttpError } from "../lib/errors.js";

export const notFoundHandler: RequestHandler = (req, res) => {
  const body: ApiError = { error: { code: "NOT_FOUND", message: `Route ${req.method} ${req.path} not found` } };
  res.status(404).json(body);
};

export const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  if (res.headersSent) return;
  let status = 500;
  let body: ApiError;
  if (err instanceof ZodError) {
    status = 400;
    body = {
      error: {
        code: "VALIDATION_ERROR",
        message: err.issues.map((i) => (i.path.length ? `${i.path.join(".")}: ${i.message}` : i.message)).join("; "),
        details: err.issues,
      },
    };
  } else if (err instanceof HttpError) {
    status = err.status;
    body = { error: { code: err.code, message: err.message, details: err.details, current: err.current } };
  } else if (err?.type === "entity.parse.failed") {
    status = 400;
    body = { error: { code: "VALIDATION_ERROR", message: "Malformed JSON body" } };
  } else if (err instanceof Prisma.PrismaClientKnownRequestError && ["P2028", "P2034", "P2024"].includes(err.code)) {
    // Transaction/pool timeout or serialization failure: transient, safe for the client to retry.
    status = 503;
    body = { error: { code: "INTERNAL_ERROR", message: "The server is busy. Please try again." } };
  } else {
    console.error("[api] unexpected error", err);
    body = { error: { code: "INTERNAL_ERROR", message: "Something went wrong on the server" } };
  }
  res.status(status).json(body);
};
