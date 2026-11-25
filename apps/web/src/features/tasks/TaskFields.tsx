import {
  ASSIGNEE_MAX,
  DESCRIPTION_MAX,
  PRIORITIES,
  PRIORITY_LABELS,
  STATUSES,
  STATUS_LABELS,
  TITLE_MAX,
  type Priority,
  type Status,
} from "@kanban/shared";
import type { ReactNode } from "react";
import { Field, inputClass } from "../../components/ui";

export type TaskFormValues = {
  title: string;
  description: string;
  priority: Priority;
  assignee: string;
  status: Status;
};

type Props = {
  idPrefix: string;
  values: TaskFormValues;
  onChange: (patch: Partial<TaskFormValues>) => void;
  assigneeSuggestions: string[];
  /** Per-field note, e.g. "changed by someone else". */
  notes?: Partial<Record<keyof TaskFormValues, ReactNode>>;
  titleError?: string | null;
  autoFocusTitle?: boolean;
};

export function TaskFields({ idPrefix, values, onChange, assigneeSuggestions, notes = {}, titleError, autoFocusTitle }: Props) {
  const id = (f: string) => `${idPrefix}-${f}`;
  return (
    <div className="space-y-4">
      <Field label="Title" htmlFor={id("title")} hint={titleError ? <p className="mt-1 text-xs text-red-600">{titleError}</p> : notes.title}>
        <input
          id={id("title")}
          className={inputClass}
          value={values.title}
          maxLength={TITLE_MAX}
          autoFocus={autoFocusTitle}
          onChange={(e) => onChange({ title: e.target.value })}
          placeholder="What needs to be done?"
          aria-invalid={!!titleError}
        />
      </Field>
      <Field label="Description" htmlFor={id("description")} hint={notes.description}>
        <textarea
          id={id("description")}
          className={`${inputClass} min-h-28 resize-y`}
          value={values.description}
          maxLength={DESCRIPTION_MAX}
          onChange={(e) => onChange({ description: e.target.value })}
          placeholder="Add more detail…"
        />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Status" htmlFor={id("status")} hint={notes.status}>
          <select
            id={id("status")}
            className={inputClass}
            value={values.status}
            onChange={(e) => onChange({ status: e.target.value as Status })}
          >
            {STATUSES.map((s) => (
              <option key={s} value={s}>
                {STATUS_LABELS[s]}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Priority" htmlFor={id("priority")} hint={notes.priority}>
          <select
            id={id("priority")}
            className={inputClass}
            value={values.priority}
            onChange={(e) => onChange({ priority: e.target.value as Priority })}
          >
            {PRIORITIES.map((p) => (
              <option key={p} value={p}>
                {PRIORITY_LABELS[p]}
              </option>
            ))}
          </select>
        </Field>
      </div>
      <Field label="Assignee" htmlFor={id("assignee")} hint={notes.assignee}>
        <input
          id={id("assignee")}
          className={inputClass}
          value={values.assignee}
          maxLength={ASSIGNEE_MAX}
          list={id("assignees")}
          onChange={(e) => onChange({ assignee: e.target.value })}
          placeholder="Unassigned"
        />
        <datalist id={id("assignees")}>
          {assigneeSuggestions.map((a) => (
            <option key={a} value={a} />
          ))}
        </datalist>
      </Field>
    </div>
  );
}
