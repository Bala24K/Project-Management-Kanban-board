import type { ConnectionState } from "./eventStream";

const LABELS: Record<ConnectionState, string> = {
  connecting: "Connecting…",
  live: "Live",
  reconnecting: "Reconnecting…",
};

export function ConnectionIndicator({ state, connections }: { state: ConnectionState; connections: number | null }) {
  const dot = state === "live" ? "bg-emerald-500 dark:bg-emerald-400" : state === "reconnecting" ? "bg-amber-500 dark:bg-amber-400" : "bg-faint";
  const others = connections !== null && state === "live" ? connections - 1 : null;
  return (
    <div
      className={`inline-flex h-8 items-center gap-2 rounded-full border px-3 text-xs font-medium transition-colors duration-200 ${state === "reconnecting" ? "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300" : "border-line bg-card text-fg"}`}
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
        {state === "live" && <span className="absolute inline-flex size-full animate-ping rounded-full bg-emerald-400 opacity-50" />}
        <span className={`relative inline-flex size-2 rounded-full ${dot}`} />
      </span>
      {LABELS[state]}
      {others !== null && (
        <span className="border-l border-line pl-2 font-normal text-muted" data-testid="presence">
          {others === 0 ? "Only you" : `${others} other${others === 1 ? "" : "s"} viewing`}
        </span>
      )}
    </div>
  );
}
