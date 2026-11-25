import type { Priority, Status } from "@kanban/shared";
import { PRIORITY_LABELS } from "@kanban/shared";
import type { ReactNode, SVGProps } from "react";

/* ---------------- icons (inline, no icon dependency) ---------------- */

type IconProps = SVGProps<SVGSVGElement>;
const base = { viewBox: "0 0 20 20", fill: "currentColor", "aria-hidden": true } as const;

export const PlusIcon = (p: IconProps) => (
  <svg {...base} {...p}>
    <path d="M10.75 4.75a.75.75 0 0 0-1.5 0v4.5h-4.5a.75.75 0 0 0 0 1.5h4.5v4.5a.75.75 0 0 0 1.5 0v-4.5h4.5a.75.75 0 0 0 0-1.5h-4.5v-4.5Z" />
  </svg>
);
export const SearchIcon = (p: IconProps) => (
  <svg {...base} {...p}>
    <path fillRule="evenodd" d="M9 3.5a5.5 5.5 0 1 0 0 11 5.5 5.5 0 0 0 0-11ZM2 9a7 7 0 1 1 12.45 4.39l3.08 3.08a.75.75 0 1 1-1.06 1.06l-3.08-3.08A7 7 0 0 1 2 9Z" clipRule="evenodd" />
  </svg>
);
export const XIcon = (p: IconProps) => (
  <svg {...base} {...p}>
    <path d="M6.28 5.22a.75.75 0 0 0-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 1 0 1.06 1.06L10 11.06l3.72 3.72a.75.75 0 1 0 1.06-1.06L11.06 10l3.72-3.72a.75.75 0 0 0-1.06-1.06L10 8.94 6.28 5.22Z" />
  </svg>
);
export const TrashIcon = (p: IconProps) => (
  <svg {...base} {...p}>
    <path fillRule="evenodd" d="M8.75 1A2.75 2.75 0 0 0 6 3.75v.44c-.8.08-1.58.18-2.36.3a.75.75 0 1 0 .22 1.49l.15-.03.8 10.42A2.75 2.75 0 0 0 7.55 19h4.9a2.75 2.75 0 0 0 2.74-2.63l.8-10.42.15.03a.75.75 0 1 0 .22-1.49A41 41 0 0 0 14 4.19v-.44A2.75 2.75 0 0 0 11.25 1h-2.5ZM10 4c.84 0 1.67.03 2.5.08v-.33c0-.69-.56-1.25-1.25-1.25h-2.5c-.69 0-1.25.56-1.25 1.25v.33C8.33 4.03 9.16 4 10 4ZM8.58 7.72a.75.75 0 0 0-1.5.06l.3 7.5a.75.75 0 1 0 1.5-.06l-.3-7.5Zm4.34.06a.75.75 0 1 0-1.5-.06l-.3 7.5a.75.75 0 1 0 1.5.06l.3-7.5Z" clipRule="evenodd" />
  </svg>
);
export const ClockIcon = (p: IconProps) => (
  <svg {...base} {...p}>
    <path fillRule="evenodd" d="M10 18a8 8 0 1 0 0-16 8 8 0 0 0 0 16Zm.75-13a.75.75 0 0 0-1.5 0v5c0 .41.34.75.75.75h4a.75.75 0 0 0 0-1.5h-3.25V5Z" clipRule="evenodd" />
  </svg>
);
export const FunnelIcon = (p: IconProps) => (
  <svg {...base} {...p}>
    <path fillRule="evenodd" d="M2.63 2.6A1 1 0 0 1 3.5 2h13a1 1 0 0 1 .78 1.63L12 10.06v5.19a1 1 0 0 1-.55.9l-2.5 1.25A1 1 0 0 1 7.5 16.5v-6.44L2.72 3.63a1 1 0 0 1-.09-1.03Z" clipRule="evenodd" />
  </svg>
);

export function Spinner({ className = "size-3.5" }: { className?: string }) {
  return (
    <svg className={`animate-spin ${className}`} viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeOpacity=".25" strokeWidth="3" />
      <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}

/* ---------------- priority ---------------- */

const PRIORITY_STYLES: Record<Priority, { badge: string; bars: number }> = {
  high: { badge: "bg-red-50 text-red-700 ring-red-600/15", bars: 3 },
  medium: { badge: "bg-amber-50 text-amber-800 ring-amber-600/20", bars: 2 },
  low: { badge: "bg-slate-50 text-slate-600 ring-slate-500/15", bars: 1 },
};

export function PriorityBadge({ priority }: { priority: Priority }) {
  const s = PRIORITY_STYLES[priority];
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] font-medium ring-1 ring-inset ${s.badge}`}
      title={`${PRIORITY_LABELS[priority]} priority`}
    >
      <span className="flex items-end gap-px" aria-hidden>
        {[1, 2, 3].map((i) => (
          <span
            key={i}
            className={`w-[3px] rounded-sm ${i <= s.bars ? "bg-current" : "bg-current opacity-20"}`}
            style={{ height: 3 + i * 2 }}
          />
        ))}
      </span>
      {PRIORITY_LABELS[priority]}
    </span>
  );
}

/* ---------------- avatar ---------------- */

const AVATAR_COLORS = [
  "bg-indigo-100 text-indigo-700",
  "bg-emerald-100 text-emerald-700",
  "bg-sky-100 text-sky-700",
  "bg-rose-100 text-rose-700",
  "bg-violet-100 text-violet-700",
  "bg-teal-100 text-teal-700",
  "bg-orange-100 text-orange-700",
];

export function Avatar({ name, size = "sm" }: { name: string; size?: "sm" | "md" }) {
  const trimmed = name.trim();
  const dims = size === "sm" ? "size-5 text-[10px]" : "size-7 text-xs";
  if (!trimmed) {
    return (
      <span
        className={`${dims} inline-flex shrink-0 items-center justify-center rounded-full border border-dashed border-slate-300 text-slate-400`}
        title="Unassigned"
        aria-label="Unassigned"
      >
        ?
      </span>
    );
  }
  let hash = 0;
  for (const ch of trimmed.toLowerCase()) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
  const initials = trimmed
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? "")
    .join("");
  return (
    <span
      className={`${dims} inline-flex shrink-0 items-center justify-center rounded-full font-semibold ${AVATAR_COLORS[hash % AVATAR_COLORS.length]}`}
      title={trimmed}
      aria-hidden
    >
      {initials}
    </span>
  );
}

/* ---------------- column accents ---------------- */

export const STATUS_ACCENT: Record<Status, string> = {
  backlog: "bg-slate-400",
  todo: "bg-sky-500",
  in_progress: "bg-amber-500",
  done: "bg-emerald-500",
};

/* ---------------- form controls ---------------- */

export function Field({ label, htmlFor, children, hint }: { label: string; htmlFor: string; children: ReactNode; hint?: ReactNode }) {
  return (
    <div>
      <label htmlFor={htmlFor} className="mb-1.5 block text-xs font-medium text-slate-700">
        {label}
      </label>
      {children}
      {hint}
    </div>
  );
}

export const inputClass =
  "block w-full rounded-lg border-0 bg-white px-3 py-2 text-sm text-slate-900 shadow-xs ring-1 ring-inset ring-slate-300 placeholder:text-slate-400 focus:ring-2 focus:ring-inset focus:ring-indigo-600 outline-none disabled:bg-slate-50 disabled:text-slate-500";

export const buttonPrimary =
  "inline-flex items-center justify-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-2 text-sm font-semibold text-white shadow-xs hover:bg-indigo-500 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600 disabled:opacity-50 disabled:cursor-not-allowed";

export const buttonSecondary =
  "inline-flex items-center justify-center gap-1.5 rounded-lg bg-white px-3 py-2 text-sm font-medium text-slate-700 shadow-xs ring-1 ring-inset ring-slate-300 hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600";
