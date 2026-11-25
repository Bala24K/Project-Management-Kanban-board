import type { ConnectionState } from "./eventStream";

const LABELS: Record<ConnectionState, string> = {
  connecting: "Connecting…",
  live: "Live",
  reconnecting: "Reconnecting…",
};

export function ConnectionIndicator({ state, connections }: { state: ConnectionState; connections: number | null }) {
  const dot = state === "live" ? "bg-emerald-500" : state === "reconnecting" ? "bg-amber-500" : "bg-slate-400";
  const others = connections !== null && state === "live" ? connections - 1 : null;
  return (
    <div
      className="inline-flex h-8 items-center gap-2 rounded-full bg-white px-3 text-xs font-medium text-slate-600 ring-1 ring-slate-200"
      role="status"
      data-testid="connection-status"
      data-state={state}
      title={
        state === "live"
          ? "Receiving real-time updates"
          : state === "reconnecting"
            ? "Connection lost. Retrying; changes from others will appear when reconnected."
            : "Connecting to real-time updates"
      }
    >
      <span className="relative flex size-2">
        {state === "live" && <span className="absolute inline-flex size-full animate-ping rounded-full bg-emerald-400 opacity-60" />}
        <span className={`relative inline-flex size-2 rounded-full ${dot}`} />
      </span>
      {LABELS[state]}
      {others !== null && (
        <span className="border-l border-slate-200 pl-2 text-slate-500" data-testid="presence">
          {others === 0 ? "Only you" : `${others} other${others === 1 ? "" : "s"} viewing`}
        </span>
      )}
    </div>
  );
}
