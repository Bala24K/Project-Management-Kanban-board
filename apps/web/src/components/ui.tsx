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
export const SunIcon = (p: IconProps) => (
  <svg {...base} {...p}>
    <path d="M10 2a.75.75 0 0 1 .75.75v1.5a.75.75 0 0 1-1.5 0v-1.5A.75.75 0 0 1 10 2ZM10 15a.75.75 0 0 1 .75.75v1.5a.75.75 0 0 1-1.5 0v-1.5A.75.75 0 0 1 10 15ZM10 7a3 3 0 1 0 0 6 3 3 0 0 0 0-6ZM15.66 5.4a.75.75 0 0 0-1.06-1.06l-1.06 1.06a.75.75 0 0 0 1.06 1.06l1.06-1.06ZM6.46 14.6a.75.75 0 1 0-1.06-1.06l-1.06 1.06a.75.75 0 0 0 1.06 1.06l1.06-1.06ZM18 10a.75.75 0 0 1-.75.75h-1.5a.75.75 0 0 1 0-1.5h1.5A.75.75 0 0 1 18 10ZM5 10a.75.75 0 0 1-.75.75h-1.5a.75.75 0 0 1 0-1.5h1.5A.75.75 0 0 1 5 10ZM14.6 15.66a.75.75 0 0 0 1.06-1.06l-1.06-1.06a.75.75 0 1 0-1.06 1.06l1.06 1.06ZM5.4 6.46a.75.75 0 0 0 1.06-1.06L5.4 4.34a.75.75 0 0 0-1.06 1.06L5.4 6.46Z" />
  </svg>
);
export const MoonIcon = (p: IconProps) => (
  <svg {...base} {...p}>
    <path fillRule="evenodd" d="M7.46 2.18a.75.75 0 0 1 .2.83 6.5 6.5 0 0 0 8.33 8.33.75.75 0 0 1 .97.98A8 8 0 1 1 6.67 2.38a.75.75 0 0 1 .79-.2Z" clipRule="evenodd" />
  </svg>
);
export const InboxIcon = (p: IconProps) => (
  <svg {...base} {...p}>
    <path fillRule="evenodd" d="M1 11.27c0-.25.03-.5.09-.75L2.6 4.28A2.25 2.25 0 0 1 4.78 2.5h10.44c1.04 0 1.94.71 2.18 1.72l1.51 6.3c.06.24.09.49.09.75v4.48A2.25 2.25 0 0 1 16.75 18H3.25A2.25 2.25 0 0 1 1 15.75v-4.48Zm3.78-7.27a.75.75 0 0 0-.73.57L2.6 10.5h2.65a1.5 1.5 0 0 1 1.34.83l.4.8a.5.5 0 0 0 .45.27h5.12a.5.5 0 0 0 .45-.28l.4-.8a1.5 1.5 0 0 1 1.34-.82h2.65l-1.45-5.93a.75.75 0 0 0-.73-.57H4.78Z" clipRule="evenodd" />
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
  high: {
    badge: "bg-red-50 text-red-700 ring-red-600/15 dark:bg-red-500/10 dark:text-red-300 dark:ring-red-400/20",
    bars: 3,
  },
  medium: {
    badge: "bg-amber-50 text-amber-800 ring-amber-600/20 dark:bg-amber-400/10 dark:text-amber-300 dark:ring-amber-300/20",
    bars: 2,
  },
  low: {
    badge: "bg-sky-50 text-sky-700 ring-sky-600/15 dark:bg-sky-400/10 dark:text-sky-300 dark:ring-sky-300/20",
    bars: 1,
  },
};

export function PriorityBadge({ priority }: { priority: Priority }) {
  const s = PRIORITY_STYLES[priority];
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-md px-1.5 py-0.5 text-[11px] font-medium ring-1 ring-inset ${s.badge}`}
      title={`${PRIORITY_LABELS[priority]} priority`}
    >
      <span className="flex items-end gap-[2px]" aria-hidden>
        {[1, 2, 3].map((i) => (
          <span
            key={i}
            className={`w-[3px] rounded-[1px] bg-current ${i <= s.bars ? "" : "opacity-25"}`}
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
  "bg-indigo-100 text-indigo-700 dark:bg-indigo-400/20 dark:text-indigo-200",
  "bg-emerald-100 text-emerald-700 dark:bg-emerald-400/15 dark:text-emerald-200",
  "bg-sky-100 text-sky-700 dark:bg-sky-400/15 dark:text-sky-200",
  "bg-rose-100 text-rose-700 dark:bg-rose-400/15 dark:text-rose-200",
  "bg-violet-100 text-violet-700 dark:bg-violet-400/20 dark:text-violet-200",
  "bg-teal-100 text-teal-700 dark:bg-teal-400/15 dark:text-teal-200",
  "bg-orange-100 text-orange-700 dark:bg-orange-400/15 dark:text-orange-200",
];

export function Avatar({ name, size = "sm" }: { name: string; size?: "sm" | "md" }) {
  const trimmed = name.trim();
  const dims = size === "sm" ? "size-5 text-[10px]" : "size-7 text-xs";
  if (!trimmed) {
    return (
      <span
        className={`${dims} inline-flex shrink-0 items-center justify-center rounded-full border border-dashed border-line-strong text-faint`}
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
      className={`${dims} inline-flex shrink-0 items-center justify-center rounded-full font-semibold ring-1 ring-black/5 dark:ring-white/10 ${AVATAR_COLORS[hash % AVATAR_COLORS.length]}`}
      title={trimmed}
      aria-hidden
    >
      {initials}
    </span>
  );
}

/* ---------------- column accents ---------------- */

/** Status dot colours. */
export const STATUS_ACCENT: Record<Status, string> = {
  backlog: "bg-slate-400 dark:bg-slate-500",
  todo: "bg-sky-500 dark:bg-sky-400",
  in_progress: "bg-amber-500 dark:bg-amber-400",
  done: "bg-emerald-500 dark:bg-emerald-400",
};

/** Thin accent line along the top of each column. */
export const STATUS_BAR: Record<Status, string> = {
  backlog: "from-slate-400/60 dark:from-slate-500/60",
  todo: "from-sky-500/70 dark:from-sky-400/70",
  in_progress: "from-amber-500/70 dark:from-amber-400/70",
  done: "from-emerald-500/70 dark:from-emerald-400/70",
};

/* ---------------- form controls ---------------- */

export function Field({ label, htmlFor, children, hint }: { label: string; htmlFor: string; children: ReactNode; hint?: ReactNode }) {
  return (
    <div>
      <label htmlFor={htmlFor} className="mb-1.5 block text-xs font-medium text-muted">
        {label}
      </label>
      {children}
      {hint}
    </div>
  );
}

export const inputClass =
  "block w-full rounded-lg border border-line bg-input px-3 py-2 text-sm text-fg shadow-xs placeholder:text-faint outline-none transition-[border-color,box-shadow] duration-150 hover:border-line-strong focus:border-accent focus:ring-3 focus:ring-ring disabled:opacity-60";

export const buttonPrimary =
  "inline-flex items-center justify-center gap-1.5 rounded-lg bg-accent-strong px-3.5 py-2 text-sm font-semibold text-white shadow-[inset_0_1px_0_rgb(255_255_255/0.16),0_1px_2px_rgb(0_0_0/0.18)] transition duration-150 hover:bg-accent-strong-hover active:scale-[0.97] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:opacity-50";

export const buttonSecondary =
  "inline-flex items-center justify-center gap-1.5 rounded-lg border border-line bg-card px-3.5 py-2 text-sm font-medium text-fg shadow-xs transition duration-150 hover:border-line-strong hover:bg-card-hover active:scale-[0.97] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent";

export const iconButton =
  "inline-flex items-center justify-center rounded-md p-1.5 text-faint transition duration-150 hover:bg-accent-soft hover:text-fg active:scale-95 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent";
