import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { BulkActionBar } from "../components/tasks/BulkActionBar";
import { ManualTaskForm } from "../components/tasks/ManualTaskForm";
import { TaskList } from "../components/tasks/TaskList";
import { TaskToolbar } from "../components/tasks/TaskToolbar";
import { ConfirmDialog } from "../components/ui/ConfirmDialog";
import { useBulkTasks, useTasks } from "../hooks/useTasks";
import { useToast } from "../lib/toast-context";
import type { BulkTaskAction } from "../types/task";
import {
  isOverdue,
  isToday,
  isUpcoming,
  matchesSearch,
  matchesView,
  sortTasks,
  tagList,
  type SortKey,
  type TaskView,
} from "../lib/task-filters";

const VIEWS: TaskView[] = ["all", "today", "upcoming", "overdue", "focus"];
const VIEW_LABELS: Record<TaskView, string> = {
  all: "All Tasks",
  today: "Today's Task",
  upcoming: "Upcoming",
  overdue: "Overdue",
  focus: "Focus",
};

export function Tasks() {
  const { data, isLoading, isError, error } = useTasks();
  const bulkTasks = useBulkTasks();
  const { toast } = useToast();
  const [params, setParams] = useSearchParams();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [confirmingBulkDelete, setConfirmingBulkDelete] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);

  // Filter state lives in the URL so a reload — or a shared link — keeps the view.
  const rawView = params.get("view") as TaskView | null;
  const view: TaskView = rawView && VIEWS.includes(rawView) ? rawView : "all";
  const query = params.get("q") ?? "";
  const tag = params.get("tag");
  const sort = (params.get("sort") as SortKey | null) ?? "manual";
  const hideCompleted = params.get("done") === "0";

  const setParam = useCallback(
    (key: string, value: string | null) => {
      setParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          if (value === null || value === "") next.delete(key);
          else next.set(key, value);
          return next;
        },
        { replace: true },
      );
    },
    [setParams],
  );

  const tasks = data ?? [];

  const counts = useMemo(
    () => ({
      all: tasks.length,
      active: tasks.filter((t) => !t.completed).length,
      today: tasks.filter((t) => isToday(t.due_date)).length,
      upcoming: tasks.filter((t) => isUpcoming(t.due_date)).length,
      overdue: tasks.filter(isOverdue).length,
      focus: tasks.filter((t) => t.is_focus).length,
    }),
    [tasks],
  );

  const hasAiScores = useMemo(
    () => tasks.some((t) => t.ai_priority_score !== null),
    [tasks],
  );

  const visibleTasks = useMemo(() => {
    const filtered = tasks.filter(
      (t) =>
        matchesView(t, view) &&
        matchesSearch(t, query) &&
        (!tag || tagList(t.tags).includes(tag)) &&
        (!hideCompleted || !t.completed),
    );
    return sortTasks(filtered, sort);
  }, [tasks, view, query, tag, hideCompleted, sort]);

  // "/" jumps to search, the way most list UIs behave.
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== "/" || e.ctrlKey || e.metaKey || e.altKey) return;
      const el = document.activeElement;
      const tagName = el?.tagName.toLowerCase();
      if (tagName === "input" || tagName === "textarea" || tagName === "select") return;
      e.preventDefault();
      searchRef.current?.focus();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, []);

  const isFiltered = view !== "all" || query !== "" || tag !== null || hideCompleted;

  const clearFilters = () => setParams({}, { replace: true });

  const onSelectChange = useCallback((id: string, isSelected: boolean) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (isSelected) next.add(id);
      else next.delete(id);
      return next;
    });
  }, []);

  // Drop selections for tasks that are no longer on screen, so a bulk action
  // can never hit something the user can't see.
  useEffect(() => {
    const visible = new Set(visibleTasks.map((t) => t.id));
    setSelected((prev) => {
      const next = new Set([...prev].filter((id) => visible.has(id)));
      return next.size === prev.size ? prev : next;
    });
  }, [visibleTasks]);

  const runBulk = (action: BulkTaskAction) => {
    const ids = [...selected];
    if (ids.length === 0) return;
    bulkTasks.mutate(
      { ids, action },
      {
        onSuccess: () => {
          setSelected(new Set());
          toast({
            message:
              action === "delete"
                ? `${ids.length} task${ids.length === 1 ? "" : "s"} deleted.`
                : `${ids.length} task${ids.length === 1 ? "" : "s"} updated.`,
            ...(action === "delete"
              ? {}
              : {
                  actionLabel: "Undo",
                  onAction: () =>
                    bulkTasks.mutate({
                      ids,
                      action: action === "complete" ? "uncomplete" : "complete",
                    }),
                }),
          });
        },
        onError: (err) =>
          toast({
            message:
              err instanceof Error && err.message
                ? err.message
                : "Bulk action failed.",
            tone: "error",
          }),
      },
    );
  };

  return (
    <div className="mx-auto w-full max-w-6xl px-6 py-8">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-3xl font-bold tracking-tight text-white">Your Tasks</h1>
        <span className="inline-flex items-center rounded-full border border-cyan-500/30 bg-cyan-500/10 px-3 py-1 text-xs font-medium text-cyan-400">
          {counts.active} active
        </span>
        {counts.overdue > 0 && (
          <span className="inline-flex items-center rounded-full border border-rose-500/30 bg-rose-500/10 px-3 py-1 text-xs font-medium text-rose-400">
            {counts.overdue} overdue
          </span>
        )}
      </div>

      <div className="mt-8 grid grid-cols-1 gap-8 lg:grid-cols-3">
        <aside className="lg:col-span-1">
          <div className="lg:sticky lg:top-8">
            <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-slate-400">
              Add a task
            </h2>
            <ManualTaskForm />
          </div>
        </aside>

        <section className="lg:col-span-2">
          <div role="tablist" aria-label="Task views" className="flex flex-wrap items-center gap-1">
            {VIEWS.map((key) => (
              <button
                key={key}
                role="tab"
                aria-selected={view === key}
                onClick={() => setParam("view", key === "all" ? null : key)}
                className={`rounded-md px-3 py-1.5 text-sm font-medium transition ${
                  view === key
                    ? "bg-white text-slate-900"
                    : "text-slate-400 hover:text-slate-200"
                }`}
              >
                {VIEW_LABELS[key]} <span className="opacity-70">{counts[key]}</span>
              </button>
            ))}
          </div>

          <div className="mt-3">
            <TaskToolbar
              ref={searchRef}
              query={query}
              onQueryChange={(value) => setParam("q", value)}
              sort={sort}
              onSortChange={(value) => setParam("sort", value === "manual" ? null : value)}
              hideCompleted={hideCompleted}
              onHideCompletedChange={(value) => setParam("done", value ? "0" : null)}
              tag={tag}
              onClearTag={() => setParam("tag", null)}
              showAiSort={hasAiScores}
            />
          </div>

          <div className="mt-4">
            <TaskList
              tasks={visibleTasks}
              isLoading={isLoading}
              isError={isError}
              error={error}
              aiCreatedIds={new Set<string>()}
              isFiltered={isFiltered}
              onClearFilters={clearFilters}
              onTagClick={(value) => setParam("tag", value)}
              selectedIds={selected}
              onSelectChange={onSelectChange}
            />
          </div>

          <BulkActionBar
            count={selected.size}
            disabled={bulkTasks.isPending}
            onComplete={() => runBulk("complete")}
            onReopen={() => runBulk("uncomplete")}
            onDelete={() => setConfirmingBulkDelete(true)}
            onClear={() => setSelected(new Set())}
          />
        </section>
      </div>

      <ConfirmDialog
        open={confirmingBulkDelete}
        title={`Delete ${selected.size} task${selected.size === 1 ? "" : "s"}?`}
        body="They will be permanently removed. This can't be undone."
        confirmLabel="Delete"
        onConfirm={() => {
          setConfirmingBulkDelete(false);
          runBulk("delete");
        }}
        onCancel={() => setConfirmingBulkDelete(false)}
      />

      <footer className="mt-12 text-center text-xs text-slate-600">
        Powered by Intelligent Context Extraction ·{" "}
        <span className="text-slate-500">Documentation &amp; Prompts</span>
      </footer>
    </div>
  );
}
