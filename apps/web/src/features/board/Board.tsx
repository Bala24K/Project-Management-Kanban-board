import { useMemo, useState } from "react";
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  closestCorners,
  pointerWithin,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
  type Announcements,
  type CollisionDetection,
} from "@dnd-kit/core";
import { arrayMove, sortableKeyboardCoordinates } from "@dnd-kit/sortable";
import { STATUSES, STATUS_LABELS, type Status } from "@kanban/shared";
import type { Columns } from "./boardState";
import { Column } from "./Column";
import { TaskCardView } from "./TaskCard";
import { findContainer, moveBetween, statusFromDroppable, toFullIndex } from "./dnd";
import { useNow } from "../../lib/time";

/**
 * Pointer-first collision detection:
 *  - pointer over a card    -> that card,
 *  - pointer over a column  -> nearest card in that column, or the column if it is empty,
 *  - no pointer (keyboard)  -> closestCorners.
 * Plain closestCorners mis-targets drops in the middle of a tall, empty column.
 */
const collisionDetection: CollisionDetection = (args) => {
  const within = pointerWithin(args);
  if (within.length === 0) return closestCorners(args);
  const overCard = within.find((c) => statusFromDroppable(String(c.id)) === null);
  if (overCard) return [overCard];
  const col = within[0]!;
  const status = statusFromDroppable(String(col.id));
  const cards = args.droppableContainers.filter(
    (c) => c.data.current?.type === "task" && c.data.current?.status === status,
  );
  return cards.length > 0 ? closestCenter({ ...args, droppableContainers: cards }) : [col];
};

type Props = {
  /** Full (unfiltered) columns: used to translate drop positions. */
  columns: Columns;
  /** Columns as displayed (after search/filters). */
  visible: Columns;
  filtering: boolean;
  savingIds: Set<string>;
  onMove: (id: string, status: Status, index: number) => void;
  onOpen: (id: string) => void;
  onAdd: (status: Status) => void;
};

/**
 * Drag state is local preview only. Nothing is sent while dragging; a single
 * move request is issued on drop, and the optimistic update replaces the preview
 * in the same render (no flicker).
 */
export function Board({ columns, visible, filtering, savingIds, onMove, onOpen, onAdd }: Props) {
  const now = useNow();
  const [activeId, setActiveId] = useState<string | null>(null);
  const [preview, setPreview] = useState<Columns | null>(null);
  const shown = preview ?? visible;

  const sensors = useSensors(
    // A small distance keeps clicks (open details) separate from drags.
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
      keyboardCodes: { start: ["Space"], cancel: ["Escape"], end: ["Space", "Enter"] },
    }),
  );

  const activeTask = useMemo(() => {
    if (!activeId) return null;
    for (const s of STATUSES) {
      const t = shown[s].find((x) => x.id === activeId);
      if (t) return t;
    }
    return null;
  }, [activeId, shown]);

  const reset = () => {
    setActiveId(null);
    setPreview(null);
  };

  const onDragStart = ({ active }: DragStartEvent) => {
    setActiveId(String(active.id));
    setPreview(visible);
  };

  const onDragOver = ({ active, over }: DragOverEvent) => {
    if (!over) return;
    const id = String(active.id);
    const overId = String(over.id);
    setPreview((cols) => {
      const current = cols ?? visible;
      const from = findContainer(current, id);
      const to = findContainer(current, overId);
      if (!from || !to || from === to) return current; // same-column reordering is animated by dnd-kit
      const overIndex = current[to].findIndex((t) => t.id === overId);
      let index = current[to].length;
      if (overIndex >= 0) {
        const activeRect = active.rect.current.translated;
        const below = activeRect ? activeRect.top > over.rect.top + over.rect.height / 2 : false;
        index = overIndex + (below ? 1 : 0);
      }
      return moveBetween(current, id, to, index);
    });
  };

  const onDragEnd = ({ active, over }: DragEndEvent) => {
    const id = String(active.id);
    const cols = preview ?? visible;
    reset();
    if (!over) return;
    const container = findContainer(cols, id);
    if (!container) return;
    let finalColumn = cols[container];
    const overId = String(over.id);
    if (!statusFromDroppable(overId) && findContainer(cols, overId) === container) {
      const from = finalColumn.findIndex((t) => t.id === id);
      const to = finalColumn.findIndex((t) => t.id === overId);
      if (from !== to && to >= 0) finalColumn = arrayMove(finalColumn, from, to);
    }
    onMove(id, container, toFullIndex(columns[container], finalColumn, id));
  };

  const announcements: Announcements = {
    onDragStart: ({ active }) => `Picked up ${titleOf(String(active.id))}.`,
    onDragOver: ({ over }) => (over ? `Over ${describe(String(over.id))}.` : "Not over a column."),
    onDragEnd: ({ over }) => (over ? `Dropped in ${describe(String(over.id))}.` : "Dropped."),
    onDragCancel: () => "Move cancelled.",
  };
  function titleOf(id: string) {
    for (const s of STATUSES) {
      const t = shown[s].find((x) => x.id === id);
      if (t) return t.title;
    }
    return "task";
  }
  function describe(id: string) {
    const s = findContainer(shown, id);
    return s ? STATUS_LABELS[s] : "column";
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={collisionDetection}
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDragEnd={onDragEnd}
      onDragCancel={reset}
      accessibility={{ announcements }}
    >
      <div className="flex h-full snap-x snap-mandatory gap-3 overflow-x-auto pb-2 sm:gap-4 lg:snap-none lg:overflow-x-visible">
        {STATUSES.map((s) => (
          <Column
            key={s}
            status={s}
            tasks={shown[s]}
            totalCount={columns[s].length}
            filtering={filtering}
            savingIds={savingIds}
            now={now}
            isDropTarget={activeId !== null && shown[s].some((t) => t.id === activeId)}
            onOpen={onOpen}
            onAdd={onAdd}
          />
        ))}
      </div>
      <DragOverlay dropAnimation={{ duration: 180, easing: "cubic-bezier(0.2, 0, 0, 1)" }}>
        {activeTask ? <TaskCardView task={activeTask} now={now} overlay /> : null}
      </DragOverlay>
    </DndContext>
  );
}
