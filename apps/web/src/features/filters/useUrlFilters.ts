import { useCallback, useEffect, useRef, useState } from "react";
import { parseFilters, serializeFilters, type Filters } from "./filters";

/**
 * Filters live in the URL (?search=&priority=&assignee=).
 * - Initial state is read from the URL, so a refresh restores it.
 * - Discrete changes (selects, clear) push a history entry; typing in the search
 *   box replaces the current entry, so Back doesn't step through every keystroke.
 * - popstate (Back/Forward) re-reads the URL.
 * No page reloads: only history.pushState/replaceState.
 */
export function useUrlFilters(): [Filters, (next: Partial<Filters>, mode?: "push" | "replace") => void] {
  const [filters, setFiltersState] = useState<Filters>(() => parseFilters(window.location.search));
  const filtersRef = useRef(filters);
  filtersRef.current = filters;

  useEffect(() => {
    const onPop = () => setFiltersState(parseFilters(window.location.search));
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  const setFilters = useCallback((patch: Partial<Filters>, mode: "push" | "replace" = "push") => {
    const next = { ...filtersRef.current, ...patch };
    filtersRef.current = next;
    setFiltersState(next);
    const qs = serializeFilters(next, window.location.search);
    const url = `${window.location.pathname}${qs}${window.location.hash}`;
    if (url === `${window.location.pathname}${window.location.search}${window.location.hash}`) return;
    if (mode === "push") window.history.pushState(null, "", url);
    else window.history.replaceState(null, "", url);
  }, []);

  return [filters, setFilters];
}
