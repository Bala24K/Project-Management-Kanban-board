import { useEffect, useState } from "react";
import type { Status } from "@kanban/shared";
import { TaskFields, type TaskFormValues } from "./TaskFields";
import { XIcon, buttonPrimary, buttonSecondary } from "../../components/ui";
import type { NewTask } from "../board/useBoard";

type Props = {
  initialStatus: Status;
  assigneeSuggestions: string[];
  onClose: () => void;
  onCreate: (task: NewTask) => void;
};

export function CreateTaskDialog({ initialStatus, assigneeSuggestions, onClose, onCreate }: Props) {
  const [values, setValues] = useState<TaskFormValues>({
    title: "",
    description: "",
    priority: "medium",
    assignee: "",
    status: initialStatus,
  });
  const [titleError, setTitleError] = useState<string | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-4" role="dialog" aria-modal="true" aria-labelledby="create-dialog-heading">
      <div className="absolute inset-0 bg-slate-900/25 backdrop-blur-[1px]" onClick={onClose} aria-hidden />
      <form
        className="relative w-full max-w-lg rounded-t-2xl bg-white shadow-2xl ring-1 ring-slate-200 sm:rounded-2xl"
        onSubmit={(e) => {
          e.preventDefault();
          if (!values.title.trim()) {
            setTitleError("Title is required");
            return;
          }
          onCreate({ ...values, title: values.title.trim(), assignee: values.assignee.trim() });
          onClose();
        }}
      >
        <header className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
          <h2 id="create-dialog-heading" className="text-sm font-semibold text-slate-900">
            New task
          </h2>
          <button type="button" onClick={onClose} className="rounded-md p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700" aria-label="Close">
            <XIcon className="size-5" />
          </button>
        </header>
        <div className="max-h-[70vh] overflow-y-auto px-5 py-5">
          <TaskFields
            idPrefix="create"
            values={values}
            onChange={(patch) => {
              setValues((v) => ({ ...v, ...patch }));
              if (patch.title !== undefined) setTitleError(null);
            }}
            assigneeSuggestions={assigneeSuggestions}
            titleError={titleError}
            autoFocusTitle
          />
        </div>
        <footer className="flex justify-end gap-2 border-t border-slate-200 bg-slate-50/60 px-5 py-3 sm:rounded-b-2xl">
          <button type="button" className={buttonSecondary} onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className={buttonPrimary}>
            Create task
          </button>
        </footer>
      </form>
    </div>
  );
}
