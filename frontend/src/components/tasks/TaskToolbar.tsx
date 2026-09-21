import { forwardRef } from "react";
import { SearchIcon, XIcon } from "../icons";
import { SORT_LABELS, type SortKey } from "../../lib/task-filters";

const SORT_ORDER: SortKey[] = ["manual", "due", "priority", "title", "ai"];

export const TaskToolbar = forwardRef<
  HTMLInputElement,
  {
    query: string;
    onQueryChange: (value: string) => void;
    sort: SortKey;
    onSortChange: (value: SortKey) => void;
    hideCompleted: boolean;
    onHideCompletedChange: (value: boolean) => void;
    tag: string | null;
    onClearTag: () => void;
    /** The AI sort is only offered once some task actually carries a score. */
    showAiSort: boolean;
  }
>(function TaskToolbar(
  {
    query,
    onQueryChange,
    sort,
    onSortChange,
    hideCompleted,
    onHideCompletedChange,
    tag,
    onClearTag,
    showAiSort,
  },
  ref,
) {
  const sortKeys = SORT_ORDER.filter((key) => key !== "ai" || showAiSort);

  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="relative min-w-0 flex-1">
        <SearchIcon className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-600" />
        <input
          ref={ref}
          type="search"
          value={query}
          onChange={(e) => onQueryChange(e.target.value)}
          placeholder="Search tasks…  ( / )"
          aria-label="Search tasks"
          className="w-full rounded-md border border-slate-800 bg-slate-950 py-2 pl-9 pr-3 text-sm text-white placeholder-slate-600 focus:border-indigo-500/50 focus:outline-none focus:ring-2 focus:ring-indigo-500/30"
        />
      </div>

      <label className="flex items-center gap-2 text-xs text-slate-400">
        <span className="hidden sm:inline">Sort</span>
        <select
          value={sort}
          onChange={(e) => onSortChange(e.target.value as SortKey)}
          aria-label="Sort tasks by"
          className="rounded-md border border-slate-800 bg-slate-950 px-2 py-2 text-sm text-white focus:border-indigo-500/50 focus:outline-none focus:ring-2 focus:ring-indigo-500/30"
        >
          {sortKeys.map((key) => (
            <option key={key} value={key}>
              {SORT_LABELS[key]}
            </option>
          ))}
        </select>
      </label>

      <button
        type="button"
        onClick={() => onHideCompletedChange(!hideCompleted)}
        aria-pressed={hideCompleted}
        className={`rounded-md border px-3 py-2 text-xs font-medium transition ${
          hideCompleted
            ? "border-indigo-500/40 bg-indigo-500/10 text-indigo-300"
            : "border-slate-800 text-slate-400 hover:text-slate-200"
        }`}
      >
        Hide done
      </button>

      {tag && (
        <button
          type="button"
          onClick={onClearTag}
          className="inline-flex items-center gap-1 rounded-full bg-slate-800 px-2 py-1 text-[11px] font-medium text-slate-300 transition hover:bg-slate-700"
          aria-label={`Clear the ${tag} tag filter`}
        >
          #{tag}
          <XIcon className="h-3 w-3" />
        </button>
      )}
    </div>
  );
});
