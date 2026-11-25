import { useEffect, useRef, useState } from "react";
import { EDITABLE_FIELDS, STATUS_LABELS, type Task } from "@kanban/shared";
import type { TaskChanges } from "../board/boardState";
import { TaskFields, type TaskFormValues } from "./TaskFields";
import { TrashIcon, XIcon, buttonPrimary, buttonSecondary } from "../../components/ui";
import { relativeTime } from "../../lib/time";

type Props = {
  /** Live task from the board view; undefined if it was deleted. */
  task: Task | undefined;
  assigneeSuggestions: string[];
  onClose: () => void;
  onSave: (changes: TaskChanges, base: TaskChanges) => void;
  onDelete: () => void;
};

const pick = (t: Task): TaskFormValues => ({
  title: t.title,
  description: t.description,
  priority: t.priority,
  assignee: t.assignee,
  status: t.status,
});

/**
 * Detail editor. `base` is the version the user is editing from. If the task
 * changes underneath (another user, via SSE):
 *  - untouched fields silently follow the latest value,
 *  - fields the user has edited keep the user's value and show a warning; on save
 *    the server compares against `base` and answers 409 if that field really changed.
 */
export function TaskDrawer({ task, assigneeSuggestions, onClose, onSave, onDelete }: Props) {
  const initial = useRef(task);
  const [base, setBase] = useState<TaskFormValues | null>(task ? pick(task) : null);
  const [values, setValues] = useState<TaskFormValues | null>(task ? pick(task) : null);
  const [remoteChanged, setRemoteChanged] = useState<Partial<Record<keyof TaskFormValues, true>>>({});
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [titleError, setTitleError] = useState<string | null>(null);
  const deleted = !task && !!initial.current;

  // Follow remote changes without clobbering local edits.
  useEffect(() => {
    if (!task || !base || !values) return;
    const latest = pick(task);
    let nextBase = base;
    let nextValues = values;
    const flagged: Partial<Record<keyof TaskFormValues, true>> = {};
    for (const f of EDITABLE_FIELDS) {
      if (latest[f] === base[f]) continue;
      const dirty = values[f] !== base[f];
      if (!dirty) {
        nextBase = { ...nextBase, [f]: latest[f] };
        nextValues = { ...nextValues, [f]: latest[f] };
      } else if (values[f] !== latest[f]) {
        flagged[f] = true;
      }
    }
    if (nextBase !== base) setBase(nextBase);
    if (nextValues !== values) setValues(nextValues);
    setRemoteChanged((prev) => ({ ...prev, ...flagged }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [task]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const save = () => {
    if (!values || !base || !task) return;
    const normalized: TaskFormValues = { ...values, title: values.title.trim(), assignee: values.assignee.trim() };
    if (!normalized.title) {
      setTitleError("Title is required");
      return;
    }
    const changes: TaskChanges = {};
    const baseOf: TaskChanges = {};
    for (const f of EDITABLE_FIELDS) {
      if (normalized[f] !== base[f]) {
        Object.assign(changes, { [f]: normalized[f] });
        Object.assign(baseOf, { [f]: base[f] });
      }
    }
    if (Object.keys(changes).length > 0) onSave(changes, baseOf);
    onClose();
  };

  const remoteNote = (f: keyof TaskFormValues) =>
    remoteChanged[f] && task ? (
      <p className="mt-1 text-xs text-amber-700">
        Someone else changed this to “{f === "status" ? STATUS_LABELS[task.status] : String(task[f]) || "empty"}”.{" "}
        <button
          type="button"
          className="font-medium underline"
          onClick={() => {
            setValues((v) => (v ? { ...v, [f]: task[f] } : v));
            setBase((b) => (b ? { ...b, [f]: task[f] } : b));
            setRemoteChanged(({ [f]: _, ...rest }) => rest);
          }}
        >
          Use theirs
        </button>
      </p>
    ) : null;

  return (
    <div className="fixed inset-0 z-50" role="dialog" aria-modal="true" aria-labelledby="drawer-title">
      <div className="absolute inset-0 bg-slate-900/20 backdrop-blur-[1px]" onClick={onClose} aria-hidden />
      <aside className="absolute inset-y-0 right-0 flex w-full max-w-md flex-col bg-white shadow-2xl ring-1 ring-slate-200">
        <header className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
          <div>
            <h2 id="drawer-title" className="text-sm font-semibold text-slate-900">
              Task details
            </h2>
            {task && (
              <p className="mt-0.5 text-xs text-slate-500">
                Updated {relativeTime(task.updatedAt)} · {STATUS_LABELS[task.status]}
              </p>
            )}
          </div>
          <button onClick={onClose} className="rounded-md p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700" aria-label="Close details">
            <XIcon className="size-5" />
          </button>
        </header>

        {deleted || !values ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-3 p-8 text-center">
            <p className="text-sm font-medium text-slate-900">This task was deleted</p>
            <p className="text-sm text-slate-500">Someone else removed it while you were viewing it.</p>
            <button className={buttonSecondary} onClick={onClose}>
              Close
            </button>
          </div>
        ) : (
          <>
            <form
              className="flex-1 overflow-y-auto px-5 py-5"
              onSubmit={(e) => {
                e.preventDefault();
                save();
              }}
              id="task-detail-form"
            >
              <TaskFields
                idPrefix="detail"
                values={values}
                onChange={(patch) => {
                  setValues((v) => (v ? { ...v, ...patch } : v));
                  if (patch.title !== undefined) setTitleError(null);
                }}
                assigneeSuggestions={assigneeSuggestions}
                titleError={titleError}
                notes={{
                  title: remoteNote("title"),
                  description: remoteNote("description"),
                  priority: remoteNote("priority"),
                  assignee: remoteNote("assignee"),
                  status: remoteNote("status"),
                }}
              />
            </form>
            <footer className="flex items-center justify-between gap-2 border-t border-slate-200 bg-slate-50/60 px-5 py-3">
              {confirmDelete ? (
                <div className="flex items-center gap-2">
                  <span className="text-xs text-slate-600">Delete this task?</span>
                  <button
                    type="button"
                    className="rounded-lg bg-red-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-red-500"
                    onClick={() => {
                      onDelete();
                      onClose();
                    }}
                  >
                    Delete
                  </button>
                  <button type="button" className="text-sm text-slate-600 hover:text-slate-900" onClick={() => setConfirmDelete(false)}>
                    Cancel
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-sm font-medium text-red-600 hover:bg-red-50"
                  onClick={() => setConfirmDelete(true)}
                >
                  <TrashIcon className="size-4" /> Delete
                </button>
              )}
              <div className="flex gap-2">
                <button type="button" className={buttonSecondary} onClick={onClose}>
                  Cancel
                </button>
                <button type="submit" form="task-detail-form" className={buttonPrimary}>
                  Save
                </button>
              </div>
            </footer>
          </>
        )}
      </aside>
    </div>
  );
}
