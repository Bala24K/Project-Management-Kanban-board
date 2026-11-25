import { PRIORITIES, PRIORITY_LABELS, type Priority } from "@kanban/shared";
import { SearchIcon, XIcon } from "../../components/ui";
import { EMPTY_FILTERS, isFiltering, UNASSIGNED, type Filters } from "./filters";

type Props = {
  filters: Filters;
  onChange: (patch: Partial<Filters>, mode?: "push" | "replace") => void;
  assignees: string[];
  matchCount: number;
  totalCount: number;
};

const selectClass = (active: boolean) =>
  `h-9 cursor-pointer rounded-lg border py-0 pr-8 pl-3 text-sm shadow-xs outline-none transition-[border-color,box-shadow,background-color] duration-150 focus:border-accent focus:ring-3 focus:ring-ring ${
    active ? "border-accent/50 bg-accent-soft font-medium text-fg" : "border-line bg-input text-muted hover:border-line-strong"
  }`;

export function FilterBar({ filters, onChange, assignees, matchCount, totalCount }: Props) {
  const active = isFiltering(filters);
  // Keep a URL value selectable even if no current task has that assignee.
  const assigneeOptions =
    filters.assignee && filters.assignee !== UNASSIGNED && !assignees.some((a) => a.toLowerCase() === filters.assignee.toLowerCase())
      ? [...assignees, filters.assignee]
      : assignees;
  const selectedAssignee =
    filters.assignee === UNASSIGNED
      ? UNASSIGNED
      : (assigneeOptions.find((a) => a.toLowerCase() === filters.assignee.toLowerCase()) ?? "");

  return (
    <div className="flex flex-wrap items-center gap-2" role="search">
      <div className="relative w-full sm:w-64">
        <SearchIcon className={`pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 ${filters.search ? "text-accent" : "text-faint"}`} />
        <input
          type="search"
          aria-label="Search tasks by title"
          placeholder="Search tasks…"
          value={filters.search}
          // First keystroke creates a history entry; subsequent ones replace it.
          onChange={(e) => onChange({ search: e.target.value }, filters.search === "" ? "push" : "replace")}
          className={`h-9 w-full rounded-lg border pr-3 pl-8 text-sm text-fg shadow-xs outline-none transition-[border-color,box-shadow,background-color] duration-150 placeholder:text-faint focus:border-accent focus:ring-3 focus:ring-ring ${filters.search ? "border-accent/50 bg-accent-soft" : "border-line bg-input hover:border-line-strong"}`}
        />
      </div>
      <select
        aria-label="Filter by priority"
        className={selectClass(filters.priority !== "")}
        value={filters.priority}
        onChange={(e) => onChange({ priority: e.target.value as Priority | "" })}
      >
        <option value="">All priorities</option>
        {PRIORITIES.map((p) => (
          <option key={p} value={p}>
            {PRIORITY_LABELS[p]}
          </option>
        ))}
      </select>
      <select
        aria-label="Filter by assignee"
        className={selectClass(filters.assignee !== "")}
        value={selectedAssignee}
        onChange={(e) => onChange({ assignee: e.target.value })}
      >
        <option value="">All assignees</option>
        <option value={UNASSIGNED}>Unassigned</option>
        {assigneeOptions.map((a) => (
          <option key={a} value={a}>
            {a}
          </option>
        ))}
      </select>
      {active && (
        <>
          <button
            onClick={() => onChange(EMPTY_FILTERS)}
            className="inline-flex h-9 items-center gap-1 rounded-lg px-2.5 text-sm font-medium text-muted transition duration-150 hover:bg-accent-soft hover:text-fg active:scale-[0.97]"
          >
            <XIcon className="size-4" /> Clear
          </button>
          <span className="text-xs text-faint tabular-nums" data-testid="match-count">
            {matchCount} of {totalCount} tasks
          </span>
        </>
      )}
    </div>
  );
}
