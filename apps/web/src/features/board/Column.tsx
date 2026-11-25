import { useDroppable } from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { STATUS_LABELS, type Status, type Task } from "@kanban/shared";
import { InboxIcon, PlusIcon, STATUS_ACCENT, STATUS_BAR, SearchIcon, iconButton } from "../../components/ui";
import { SortableTaskCard } from "./TaskCard";
import { columnDroppableId } from "./dnd";

type Props = {
  status: Status;
  tasks: Task[];
  totalCount: number;
  filtering: boolean;
  savingIds: Set<string>;
  now: number;
  /** Visual only: the dragged card is currently placed in this column. */
  isDropTarget?: boolean;
  onOpen: (id: string) => void;
  onAdd: (status: Status) => void;
};

export function Column({ status, tasks, totalCount, filtering, savingIds, now, isDropTarget, onOpen, onAdd }: Props) {
  const { setNodeRef, isOver } = useDroppable({ id: columnDroppableId(status), data: { type: "column", status } });
  const label = STATUS_LABELS[status];
  const highlighted = isOver || isDropTarget;
  const noMatches = filtering && totalCount > 0;

  return (
    <section
      aria-label={label}
      data-testid={`column-${status}`}
      className={`relative flex max-h-full min-h-0 w-[85vw] shrink-0 snap-start flex-col overflow-hidden rounded-2xl border bg-panel transition-[border-color,box-shadow] duration-200 sm:w-80 lg:w-auto lg:min-w-0 lg:flex-1 ${
        highlighted ? "border-accent/40 shadow-[0_0_0_3px_var(--ring)]" : "border-panel-line"
      }`}
    >
      <span aria-hidden className={`pointer-events-none absolute inset-x-0 top-0 h-[2px] bg-linear-to-r ${STATUS_BAR[status]} to-transparent`} />
      <header className="flex items-center justify-between px-3 pt-3.5 pb-2.5">
        <div className="flex items-center gap-2">
          <span className={`size-2 rounded-full ${STATUS_ACCENT[status]}`} aria-hidden />
          <h2 className="text-[13px] font-semibold tracking-[-0.01em] text-fg">{label}</h2>
          <span
            className="min-w-5 rounded-md border border-line bg-card px-1.5 py-px text-center text-[11px] font-medium text-muted tabular-nums"
            data-testid="column-count"
          >
            {filtering ? `${tasks.length}/${totalCount}` : totalCount}
          </span>
        </div>
        <button onClick={() => onAdd(status)} className={iconButton} aria-label={`Add task to ${label}`} title={`Add task to ${label}`}>
          <PlusIcon className="size-4" />
        </button>
      </header>

      <SortableContext id={status} items={tasks.map((t) => t.id)} strategy={verticalListSortingStrategy}>
        <ol
          ref={setNodeRef}
          className={`flex min-h-24 flex-1 flex-col gap-2 overflow-y-auto px-2 pb-3 transition-colors duration-200 ${
            isOver ? "bg-accent-soft/50" : ""
          }`}
        >
          {tasks.map((task) => (
            <SortableTaskCard key={task.id} task={task} now={now} saving={savingIds.has(task.id)} onOpen={onOpen} />
          ))}
          {tasks.length === 0 && (
            <li
              className={`flex list-none flex-col items-center justify-center gap-2 rounded-xl border border-dashed px-3 py-7 text-center transition-colors duration-200 ${
                isOver ? "border-accent/60 bg-accent-soft text-accent" : "border-line-strong text-faint"
              }`}
            >
              {noMatches ? <SearchIcon className="size-5 opacity-70" /> : <InboxIcon className="size-5 opacity-70" />}
              <p className="text-xs font-medium">{noMatches ? "No tasks match your filters" : isOver ? "Drop here" : "No tasks yet"}</p>
              {!noMatches && !isOver && (
                <button
                  type="button"
                  onClick={() => onAdd(status)}
                  className="rounded-md px-2 py-1 text-xs font-medium text-accent transition duration-150 hover:bg-accent-soft focus-visible:outline-2 focus-visible:outline-accent"
                >
                  Add a task
                </button>
              )}
            </li>
          )}
        </ol>
      </SortableContext>
    </section>
  );
}
