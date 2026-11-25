import { STATUSES } from "@kanban/shared";

export function BoardSkeleton() {
  return (
    <div className="flex h-full gap-3 overflow-hidden sm:gap-4" aria-busy="true" aria-label="Loading board">
      {STATUSES.map((s, i) => (
        <div
          key={s}
          className="flex w-[85vw] shrink-0 flex-col gap-2 rounded-2xl border border-panel-line bg-panel p-3 sm:w-80 lg:w-auto lg:flex-1"
        >
          <div className="mb-1.5 flex items-center gap-2">
            <div className="size-2 animate-pulse rounded-full bg-line-strong" />
            <div className="h-3.5 w-20 animate-pulse rounded bg-line-strong" />
          </div>
          {Array.from({ length: 3 - (i % 2) }).map((_, j) => (
            <div key={j} className="rounded-xl border border-line bg-card p-3 shadow-card">
              <div className="h-3.5 w-4/5 animate-pulse rounded bg-line-strong" />
              <div className="mt-2 h-3 w-3/5 animate-pulse rounded bg-line" />
              <div className="mt-3.5 flex justify-between">
                <div className="h-4 w-14 animate-pulse rounded bg-line" />
                <div className="size-5 animate-pulse rounded-full bg-line" />
              </div>
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}
