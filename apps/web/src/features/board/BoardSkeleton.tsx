import { STATUSES } from "@kanban/shared";

export function BoardSkeleton() {
  return (
    <div className="flex h-full gap-4 overflow-hidden" aria-busy="true" aria-label="Loading board">
      {STATUSES.map((s, i) => (
        <div key={s} className="flex w-[85vw] shrink-0 flex-col gap-2 rounded-xl bg-slate-100/80 p-3 ring-1 ring-slate-200/70 sm:w-80 lg:w-auto lg:flex-1">
          <div className="mb-1 h-4 w-24 animate-pulse rounded bg-slate-200" />
          {Array.from({ length: 3 - (i % 2) }).map((_, j) => (
            <div key={j} className="rounded-lg border border-slate-200 bg-white p-3">
              <div className="h-3.5 w-4/5 animate-pulse rounded bg-slate-200" />
              <div className="mt-2 h-3 w-3/5 animate-pulse rounded bg-slate-100" />
              <div className="mt-3 flex justify-between">
                <div className="h-4 w-14 animate-pulse rounded bg-slate-100" />
                <div className="size-5 animate-pulse rounded-full bg-slate-100" />
              </div>
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}
