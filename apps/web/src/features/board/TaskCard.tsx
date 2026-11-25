import { memo } from "react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import type { Task } from "@kanban/shared";
import { Avatar, ClockIcon, PriorityBadge, Spinner } from "../../components/ui";
import { relativeTime } from "../../lib/time";

type ViewProps = {
  task: Task;
  now: number;
  saving?: boolean;
  overlay?: boolean;
};

export function TaskCardView({ task, now, saving, overlay }: ViewProps) {
  return (
    <div
      className={`group relative rounded-xl border bg-card p-3 text-left transition-[box-shadow,border-color,background-color,transform] duration-150 ease-out ${
        overlay
          ? "rotate-[1.5deg] scale-[1.02] cursor-grabbing border-accent/40 shadow-pop ring-1 ring-accent/30"
          : "border-line shadow-card hover:-translate-y-px hover:border-line-strong hover:bg-card-hover hover:shadow-card-hover"
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <h3 className="line-clamp-2 text-[13px] leading-snug font-medium tracking-[-0.005em] text-fg">{task.title}</h3>
        {saving && (
          <span className="mt-0.5 shrink-0 text-accent" title="Saving…" aria-label="Saving">
            <Spinner className="size-3" />
          </span>
        )}
      </div>
      {task.description && <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-muted">{task.description}</p>}
      <div className="mt-3 flex items-center justify-between gap-2">
        <PriorityBadge priority={task.priority} />
        <div className="flex min-w-0 items-center gap-2.5">
          <span className="flex items-center gap-1 text-[11px] text-faint tabular-nums" title={new Date(task.updatedAt).toLocaleString()}>
            <ClockIcon className="size-3" />
            {relativeTime(task.updatedAt, now)}
          </span>
          <span className="flex min-w-0 items-center gap-1.5">
            <Avatar name={task.assignee} />
            {task.assignee && <span className="max-w-20 truncate text-[11px] font-medium text-muted">{task.assignee}</span>}
          </span>
        </div>
      </div>
    </div>
  );
}

type SortableProps = ViewProps & { onOpen: (id: string) => void };

export const SortableTaskCard = memo(function SortableTaskCard({ task, now, saving, onOpen }: SortableProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: task.id,
    data: { type: "task", status: task.status },
  });

  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      className="relative list-none"
      data-testid="task-card"
      data-task-id={task.id}
    >
      {isDragging ? (
        // Insertion indicator: a placeholder showing exactly where the card will land.
        <div
          className="rounded-xl border-2 border-dashed border-accent/50 bg-accent-soft"
          style={{ minHeight: 84 }}
          aria-hidden
        />
      ) : (
        <div
          {...attributes}
          {...listeners}
          role="button"
          aria-roledescription="Draggable task"
          aria-label={`${task.title}. Press Enter to open, Space to pick up and move.`}
          onClick={() => onOpen(task.id)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              onOpen(task.id);
              return;
            }
            listeners?.onKeyDown?.(e);
          }}
          className="cursor-grab rounded-xl focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent active:cursor-grabbing"
        >
          <TaskCardView task={task} now={now} saving={saving} />
        </div>
      )}
    </li>
  );
});
