import type { Task as DbTask } from "@prisma/client";
import type { Task } from "@kanban/shared";

export function toTask(t: DbTask): Task {
  return {
    id: t.id,
    title: t.title,
    description: t.description,
    priority: t.priority,
    assignee: t.assignee,
    status: t.status,
    position: t.position,
    revision: t.revision,
    createdAt: t.createdAt.toISOString(),
    updatedAt: t.updatedAt.toISOString(),
  };
}
