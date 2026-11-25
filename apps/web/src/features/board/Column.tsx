import { useDroppable } from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { STATUS_LABELS, type Status, type Task } from "@kanban/shared";
import { PlusIcon, STATUS_ACCENT } from "../../components/ui";
import { SortableTaskCard } from "./TaskCard";
import { columnDroppableId } from "./dnd";

type Props = {
  status: Status;
  tasks: Task[];
  totalCount: number;
  filtering: boolean;
  savingIds: Set<string>;
  now: number;
  onOpen: (id: string) => void;
  onAdd: (status: Status) => void;
};

export function Column({ status, tasks, totalCount, filtering, savingIds, now, onOpen, onAdd }: Props) {
  const { setNodeRef, isOver } = useDroppable({ id: columnDroppableId(status), data: { type: "column", status } });
  const label = STATUS_LABELS[status];

  return (
    <section
      aria-label={label}
      data-testid={`column-${status}`}
      className="flex max-h-full min-h-0 w-[85vw] shrink-0 snap-start flex-col rounded-xl bg-slate-100/80 ring-1 ring-slate-200/70 sm:w-80 lg:w-auto lg:min-w-0 lg:flex-1"
    >
      <header className="flex items-center justify-between px-3 pt-3 pb-2">
        <div className="flex items-center gap-2">
          <span className={`size-2 rounded-full ${STATUS_ACCENT[status]}`} aria-hidden />
          <h2 className="text-[13px] font-semibold text-slate-800">{label}</h2>
          <span className="rounded-full bg-white px-1.5 py-px text-[11px] font-medium text-slate-500 ring-1 ring-slate-200" data-testid="column-count">
            {filtering ? `${tasks.length}/${totalCount}` : totalCount}
          </span>
        </div>
        <button
          onClick={() => onAdd(status)}
          className="rounded-md p-1 text-slate-400 hover:bg-white hover:text-slate-700"
          aria-label={`Add task to ${label}`}
          title={`Add task to ${label}`}
        >
          <PlusIcon className="size-4" />
        </button>
      </header>

      <SortableContext id={status} items={tasks.map((t) => t.id)} strategy={verticalListSortingStrategy}>
        <ol
          ref={setNodeRef}
          className={`flex min-h-24 flex-1 flex-col gap-2 overflow-y-auto px-2 pb-3 transition-colors ${
            isOver ? "rounded-b-xl bg-indigo-50/50" : ""
          }`}
        >
          {tasks.map((task) => (
            <SortableTaskCard key={task.id} task={task} now={now} saving={savingIds.has(task.id)} onOpen={onOpen} />
          ))}
          {tasks.length === 0 && (
            <li
              className={`flex list-none flex-col items-center justify-center rounded-lg border border-dashed px-3 py-8 text-center text-xs ${
                isOver ? "border-indigo-300 text-indigo-600" : "border-slate-300 text-slate-400"
              }`}
            >
              {filtering && totalCount > 0 ? "No tasks match your filters" : isOver ? "Drop here" : "No tasks yet"}
            </li>
          )}
        </ol>
      </SortableContext>
    </section>
  );
}
