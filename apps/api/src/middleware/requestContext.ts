import type { Request } from "express";
import { HEADER_CLIENT_ID, HEADER_MUTATION_ID } from "@kanban/shared";

const SAFE_ID = /^[A-Za-z0-9_-]{1,64}$/;

/** Originating client / mutation identifiers, echoed back in broadcast events. */
export function mutationContext(req: Request): { clientId: string | null; mutationId: string | null } {
  const clientId = req.header(HEADER_CLIENT_ID);
  const mutationId = req.header(HEADER_MUTATION_ID);
  return {
    clientId: clientId && SAFE_ID.test(clientId) ? clientId : null,
    mutationId: mutationId && SAFE_ID.test(mutationId) ? mutationId : null,
  };
}

export function isSafeId(v: unknown): v is string {
  return typeof v === "string" && SAFE_ID.test(v);
}
