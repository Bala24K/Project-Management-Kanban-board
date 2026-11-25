import { useCallback, useEffect, useMemo, useState } from "react";
import { STATUSES, type Status } from "@kanban/shared";
import { ToastProvider } from "./components/Toasts";
import { MoonIcon, PlusIcon, SunIcon, buttonPrimary, buttonSecondary } from "./components/ui";
import { Board } from "./features/board/Board";
import { BoardSkeleton } from "./features/board/BoardSkeleton";
import { findTask, useBoard } from "./features/board/useBoard";
import { ConnectionIndicator } from "./features/collaboration/ConnectionIndicator";
import { FilterBar } from "./features/filters/FilterBar";
import { collectAssignees, filterColumns, isFiltering } from "./features/filters/filters";
import { useUrlFilters } from "./features/filters/useUrlFilters";
import { CreateTaskDialog } from "./features/tasks/CreateTaskDialog";
import { TaskDrawer } from "./features/tasks/TaskDrawer";
import { api, getSimulateFailures, setSimulateFailures } from "./lib/api";
import { useTheme } from "./lib/theme";

export default function App() {
  return (
    <ToastProvider>
      <BoardPage />
    </ToastProvider>
  );
}

function BoardPage() {
  const board = useBoard();
  const [filters, setFilters] = useUrlFilters();
  const [openTaskId, setOpenTaskId] = useState<string | null>(null);
  const [createIn, setCreateIn] = useState<Status | null>(null);

  const visible = useMemo(() => filterColumns(board.columns, filters), [board.columns, filters]);
  const assignees = useMemo(() => collectAssignees(board.columns), [board.columns]);
  const savingIds = useMemo(() => new Set(board.pending.map((m) => m.taskId)), [board.pending]);
  const totalCount = STATUSES.reduce((n, s) => n + board.columns[s].length, 0);
  const matchCount = STATUSES.reduce((n, s) => n + visible[s].length, 0);
  const filtering = isFiltering(filters);
  const openTask = openTaskId ? findTask(board.columns, openTaskId) : undefined;

  const closeDrawer = useCallback(() => setOpenTaskId(null), []);
  const closeCreate = useCallback(() => setCreateIn(null), []);

  return (
    <div className="flex h-dvh flex-col text-fg">
      <header className="relative z-20 border-b border-line bg-header backdrop-blur-md">
        <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 sm:px-6">
          <div className="flex min-w-0 items-center gap-3">
            <div
              className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-linear-to-br from-[#8b7cff] to-[#5b4be3] shadow-[inset_0_1px_0_rgb(255_255_255/0.25),0_4px_12px_-2px_rgb(91_75_227/0.45)]"
              aria-hidden
            >
              <svg viewBox="0 0 32 32" className="size-5">
                <rect x="6" y="7" width="5" height="18" rx="2" fill="white" />
                <rect x="13.5" y="7" width="5" height="11" rx="2" fill="white" opacity=".85" />
                <rect x="21" y="7" width="5" height="14" rx="2" fill="white" opacity=".7" />
              </svg>
            </div>
            <div className="min-w-0">
              <p className="text-[11px] leading-none font-semibold tracking-[0.08em] text-accent uppercase">Flowboard</p>
              <h1 className="mt-1 truncate text-[17px] leading-tight font-semibold tracking-[-0.015em] text-fg">
                {board.boardTitle || "Board"}
              </h1>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <FailureToggle />
            <ConnectionIndicator state={board.connection} connections={board.connections} />
            <ThemeToggle />
            <button className={buttonPrimary} onClick={() => setCreateIn("backlog")}>
              <PlusIcon className="size-4" /> New task
            </button>
          </div>
        </div>
        <div className="border-t border-line px-4 py-2.5 sm:px-6">
          <FilterBar filters={filters} onChange={setFilters} assignees={assignees} matchCount={matchCount} totalCount={totalCount} />
        </div>
      </header>

      <main className="min-h-0 flex-1 px-4 pt-4 pb-2 sm:px-6">
        {board.phase === "loading" && <BoardSkeleton />}
        {board.phase === "error" && (
          <div className="animate-pop-in mx-auto mt-16 max-w-sm rounded-2xl border border-red-300/60 bg-card p-6 text-center shadow-pop dark:border-red-400/30" role="alert">
            <p className="text-sm font-semibold text-fg">Couldn't load the board</p>
            <p className="mt-1 text-sm text-muted">{board.loadError}</p>
            <button className={`${buttonSecondary} mt-4`} onClick={board.retryLoad}>
              Try again
            </button>
          </div>
        )}
        {board.phase === "ready" && (
          <Board
            columns={board.columns}
            visible={visible}
            filtering={filtering}
            savingIds={savingIds}
            onMove={board.moveTask}
            onOpen={setOpenTaskId}
            onAdd={setCreateIn}
          />
        )}
      </main>

      {openTaskId && (
        <TaskDrawer
          key={openTaskId}
          task={openTask}
          assigneeSuggestions={assignees}
          onClose={closeDrawer}
          onSave={(changes, base) => void board.updateTask(openTaskId, changes, base)}
          onDelete={() => void board.deleteTask(openTaskId)}
        />
      )}
      {createIn && (
        <CreateTaskDialog
          initialStatus={createIn}
          assigneeSuggestions={assignees}
          onClose={closeCreate}
          onCreate={(t) => void board.createTask(t)}
        />
      )}
    </div>
  );
}

/** Dev/demo control: only rendered when the server has failure simulation enabled. */
function FailureToggle() {
  const [available, setAvailable] = useState(false);
  const [on, setOn] = useState(getSimulateFailures);
  useEffect(() => {
    api
      .health()
      .then((h) => setAvailable(h.failureSimulation))
      .catch(() => setAvailable(false));
  }, []);
  if (!available) return null;
  return (
    <label
      className={`hidden h-8 cursor-pointer items-center gap-2 rounded-full border px-3 text-xs font-medium transition-colors duration-150 select-none sm:inline-flex ${
        on
          ? "border-red-300/70 bg-red-50 text-red-700 dark:border-red-400/30 dark:bg-red-500/10 dark:text-red-300"
          : "border-line bg-card text-muted hover:text-fg"
      }`}
      title="Development aid: make every create/update/delete/move request fail so you can see the rollback."
    >
      <input
        type="checkbox"
        className="size-3.5 accent-red-600"
        checked={on}
        onChange={(e) => {
          setSimulateFailures(e.target.checked);
          setOn(e.target.checked);
        }}
        data-testid="simulate-failures"
      />
      Simulate API failures
    </label>
  );
}

/** Dark / light switch; the choice persists in localStorage. */
function ThemeToggle() {
  const [theme, toggle] = useTheme();
  const next = theme === "dark" ? "light" : "dark";
  return (
    <button
      type="button"
      onClick={toggle}
      className="inline-flex size-8 items-center justify-center rounded-full border border-line bg-card text-muted transition duration-150 hover:border-line-strong hover:text-fg active:scale-95 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
      aria-label={`Switch to ${next} theme`}
      title={`Switch to ${next} theme`}
      data-testid="theme-toggle"
    >
      {theme === "dark" ? <SunIcon className="size-4" /> : <MoonIcon className="size-4" />}
    </button>
  );
}
