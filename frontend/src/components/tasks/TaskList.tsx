import type { Task } from "../../types/task";
import { TaskCard } from "./TaskCard";

const NO_AI_IDS: ReadonlySet<string> = new Set<string>();

interface TaskListProps {
  tasks: Task[];
  isLoading: boolean;
  isError: boolean;
  error: unknown;
  /** Ids of tasks created via the AI parser this session. Omitted on manual-only pages. */
  aiCreatedIds?: ReadonlySet<string>;
  /** True when a view/search/tag filter is narrowing the list, so "empty" means
   *  "nothing matched" rather than "nothing exists". */
  isFiltered?: boolean;
  onClearFilters?: () => void;
  onTagClick?: (tag: string) => void;
  selectedIds?: ReadonlySet<string>;
  onSelectChange?: (id: string, selected: boolean) => void;
}

export function TaskList({
  tasks,
  isLoading,
  isError,
  error,
  aiCreatedIds = NO_AI_IDS,
  isFiltered = false,
  onClearFilters,
  onTagClick,
  selectedIds,
  onSelectChange,
}: TaskListProps) {
  if (isLoading) {
    return (
      <div className="space-y-3" aria-busy="true" aria-label="Loading tasks">
        {[0, 1, 2].map((i) => (
          <div
            key={i}
            className="animate-pulse rounded-xl border border-slate-800 bg-slate-900/60 p-4"
          >
            <div className="h-4 w-1/3 rounded bg-slate-800" />
            <div className="mt-3 h-3 w-2/3 rounded bg-slate-800/70" />
          </div>
        ))}
      </div>
    );
  }

  if (isError) {
    return (
      <p className="py-8 text-center text-sm text-rose-400">
        Failed to load tasks: {error instanceof Error ? error.message : "error"}
      </p>
    );
  }

  if (tasks.length === 0) {
    return isFiltered ? (
      <div className="py-8 text-center">
        <p className="text-sm text-slate-500">No tasks match these filters.</p>
        {onClearFilters && (
          <button
            type="button"
            onClick={onClearFilters}
            className="mt-3 rounded-md border border-slate-700 px-3 py-1.5 text-sm font-medium text-slate-300 transition hover:bg-slate-800"
          >
            Clear filters
          </button>
        )}
      </div>
    ) : (
      <div className="py-8 text-center">
        <p className="text-sm text-slate-500">No tasks yet.</p>
        <p className="mt-1 text-xs text-slate-600">
          Add your first one with the form on the left.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {tasks.map((task) => (
        <TaskCard
          key={task.id}
          task={task}
          isAiExtracted={aiCreatedIds.has(task.id)}
          onTagClick={onTagClick}
          selected={selectedIds?.has(task.id) ?? false}
          onSelectChange={onSelectChange}
        />
      ))}
    </div>
  );
}
