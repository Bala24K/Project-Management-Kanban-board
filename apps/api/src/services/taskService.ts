import { Prisma } from "@prisma/client";
import {
  EDITABLE_FIELDS,
  type BoardResponse,
  type ColumnOrder,
  type CreateTaskInput,
  type DeleteResponse,
  type MutationResponse,
  type Status,
  type UpdateTaskInput,
  createTaskSchema,
  updateTaskSchema,
} from "@kanban/shared";
import { randomUUID } from "node:crypto";
import type { Db } from "../lib/prisma.js";
import { HttpError, notFound } from "../lib/errors.js";
import { toTask } from "../lib/serialize.js";

export const BOARD_ID = "main";
export const BOARD_TITLE = "Product Roadmap";

type Tx = Prisma.TransactionClient;

/** Writers queue on the board row lock; allow them to wait rather than fail fast. */
const TX_OPTIONS = { maxWait: 10_000, timeout: 15_000 } as const;

/**
 * Business logic + database access for tasks.
 *
 * Every write runs in one transaction that:
 *  1. bumps Board.revision (row lock => writers are serialised, value => sequence id),
 *  2. applies the change,
 *  3. renumbers the affected column(s) so positions stay dense (0..n-1).
 *
 * Renumbering only touches `position`; it does not change the `revision` or
 * `updatedAt` of the shifted tasks, since those were not explicitly modified.
 */
export class TaskService {
  constructor(private readonly db: Db) {}

  async ensureBoard(): Promise<void> {
    await this.db.board.upsert({
      where: { id: BOARD_ID },
      create: { id: BOARD_ID, title: BOARD_TITLE },
      update: {},
    });
  }

  async currentRevision(): Promise<number> {
    const board = await this.db.board.findUnique({ where: { id: BOARD_ID }, select: { revision: true } });
    return board?.revision ?? 0;
  }

  async getBoard(): Promise<BoardResponse> {
    await this.ensureBoard();
    // Repeatable read gives a consistent snapshot of revision + tasks.
    const [board, tasks] = await this.db.$transaction(
      [
        this.db.board.findUniqueOrThrow({ where: { id: BOARD_ID } }),
        this.db.task.findMany({ orderBy: [{ status: "asc" }, { position: "asc" }, { id: "asc" }] }),
      ],
      { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
    );
    return {
      board: { id: board.id, title: board.title },
      tasks: tasks.map(toTask),
      revision: board.revision,
    };
  }

  async create(raw: CreateTaskInput): Promise<MutationResponse> {
    const input = createTaskSchema.parse(raw);
    const id = input.id ?? randomUUID();
    try {
      return await this.db.$transaction(async (tx) => {
        const revision = await this.bumpRevision(tx);
        const ids = await this.columnIds(tx, input.status);
        const index = clamp(input.position ?? ids.length, 0, ids.length);
        ids.splice(index, 0, id);
        const now = new Date();
        const created = await tx.task.create({
          data: {
            id,
            title: input.title,
            description: input.description,
            priority: input.priority,
            assignee: input.assignee,
            status: input.status,
            position: index,
            revision,
            createdAt: now,
            updatedAt: now,
          },
        });
        await this.renumber(tx, ids);
        return { task: toTask({ ...created, position: index }), order: { [input.status]: ids }, revision };
      }, TX_OPTIONS);
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
        throw new HttpError(409, "CONFLICT", "A task with this id already exists");
      }
      throw err;
    }
  }

  async update(id: string, raw: UpdateTaskInput): Promise<MutationResponse> {
    const input = updateTaskSchema.parse(raw);
    return this.db.$transaction(async (tx) => {
      const revision = await this.bumpRevision(tx);
      const current = await tx.task.findUnique({ where: { id } });
      if (!current) throw notFound("Task");

      // Field-level compare-and-set: reject only if a field the client edited
      // was changed by someone else to a different value in the meantime.
      if (input.expected) {
        const conflicts = EDITABLE_FIELDS.filter((f) => {
          const base = input.expected?.[f];
          if (base === undefined) return false;
          const now = current[f];
          return now !== base && now !== input[f];
        });
        if (conflicts.length > 0) {
          throw new HttpError(
            409,
            "CONFLICT",
            `This task was changed by someone else (${conflicts.join(", ")}). Review the latest version and try again.`,
            { fields: conflicts },
            toTask(current),
          );
        }
      }

      const fromStatus = current.status;
      const toStatus = input.status ?? fromStatus;
      const moving = toStatus !== fromStatus || input.position !== undefined;
      const order: ColumnOrder = {};
      let position = current.position;

      if (moving) {
        const source = (await this.columnIds(tx, fromStatus)).filter((x) => x !== id);
        const dest = toStatus === fromStatus ? source : await this.columnIds(tx, toStatus);
        const fallback = toStatus === fromStatus ? current.position : dest.length;
        position = clamp(input.position ?? fallback, 0, dest.length);
        dest.splice(position, 0, id);
        if (toStatus !== fromStatus) {
          await this.renumber(tx, source);
          order[fromStatus] = source;
        }
        order[toStatus] = dest;
      }

      const updated = await tx.task.update({
        where: { id },
        data: {
          title: input.title,
          description: input.description,
          priority: input.priority,
          assignee: input.assignee,
          status: toStatus,
          position,
          revision,
          updatedAt: new Date(),
        },
      });
      if (moving) await this.renumber(tx, order[toStatus]!);
      return { task: toTask(updated), order, revision };
    }, TX_OPTIONS);
  }

  async remove(id: string): Promise<DeleteResponse> {
    return this.db.$transaction(async (tx) => {
      const revision = await this.bumpRevision(tx);
      const current = await tx.task.findUnique({ where: { id } });
      if (!current) throw notFound("Task");
      await tx.task.delete({ where: { id } });
      const ids = await this.columnIds(tx, current.status);
      await this.renumber(tx, ids);
      return { id, order: { [current.status]: ids }, revision };
    }, TX_OPTIONS);
  }

  /* ---------------------------------------------------------------- */

  private async bumpRevision(tx: Tx): Promise<number> {
    const rows = await tx.$queryRaw<{ revision: number }[]>`
      UPDATE "Board" SET revision = revision + 1 WHERE id = ${BOARD_ID} RETURNING revision`;
    if (rows[0]) return rows[0].revision;
    // First write ever: create the board row (concurrent creators are safe).
    await tx.$executeRaw`
      INSERT INTO "Board" (id, title, revision) VALUES (${BOARD_ID}, ${BOARD_TITLE}, 0)
      ON CONFLICT (id) DO NOTHING`;
    const retry = await tx.$queryRaw<{ revision: number }[]>`
      UPDATE "Board" SET revision = revision + 1 WHERE id = ${BOARD_ID} RETURNING revision`;
    return retry[0]!.revision;
  }

  private async columnIds(tx: Tx, status: Status): Promise<string[]> {
    const rows = await tx.task.findMany({
      where: { status },
      orderBy: [{ position: "asc" }, { id: "asc" }],
      select: { id: true },
    });
    return rows.map((r) => r.id);
  }

  /** Set position = index for every id whose position differs. One statement. */
  private async renumber(tx: Tx, ids: string[]): Promise<void> {
    if (ids.length === 0) return;
    await tx.$executeRaw`
      UPDATE "Task" AS t SET position = d.ord - 1
      FROM unnest(${ids}::uuid[]) WITH ORDINALITY AS d(id, ord)
      WHERE t.id = d.id AND t.position <> d.ord - 1`;
  }
}

function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n));
}
