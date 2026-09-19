import { useMemo, useState } from "react";
import { TaskForm } from "../components/tasks/TaskForm";
import { TaskList } from "../components/tasks/TaskList";
import { usePrioritize, useTasks } from "../hooks/useTasks";
import type { Task } from "../types/task";
import { SparklesIcon } from "../components/icons";

type Filter = "all" | "urgent" | "upcoming";

function sortByUrgency(tasks: Task[]): Task[] {
  const hasScores = tasks.some((t) => t.ai_priority_score !== null);
  if (!hasScores) return tasks;
  return [...tasks].sort(
    (a, b) => (b.ai_priority_score ?? -1) - (a.ai_priority_score ?? -1),
  );
}

export function Tasks() {
  const { data, isLoading, isError, error } = useTasks();
  const prioritize = usePrioritize();
  const [filter, setFilter] = useState<Filter>("all");
  const [prioritizeError, setPrioritizeError] = useState<string | null>(null);
  const [aiCreatedIds, setAiCreatedIds] = useState<Set<string>>(new Set());

  const tasks = useMemo(() => sortByUrgency(data ?? []), [data]);

  const counts = useMemo(
    () => ({
      all: tasks.length,
      active: tasks.filter((t) => !t.completed).length,
      urgent: tasks.filter((t) => !t.completed && t.priority === "high").length,
      upcoming: tasks.filter(
        (t) => !t.completed && t.priority !== "high" && t.due_date,
      ).length,
    }),
    [tasks],
  );

  const filteredTasks = useMemo(() => {
    if (filter === "urgent") {
      return tasks.filter((t) => !t.completed && t.priority === "high");
    }
    if (filter === "upcoming") {
      return tasks.filter((t) => !t.completed && t.priority !== "high" && t.due_date);
    }
    return tasks;
  }, [tasks, filter]);

  const handlePrioritize = async () => {
    setPrioritizeError(null);
    try {
      await prioritize.mutateAsync();
    } catch (err) {
      setPrioritizeError(err instanceof Error ? err.message : "Failed to prioritize");
    }
  };

  const handleAiCreated = (task: Task) => {
    setAiCreatedIds((prev) => new Set(prev).add(task.id));
  };

  const tabs: { key: Filter; label: string; count: number }[] = [
    { key: "all", label: "All Tasks", count: counts.all },
    { key: "urgent", label: "Urgent", count: counts.urgent },
    { key: "upcoming", label: "Upcoming", count: counts.upcoming },
  ];

  return (
    <div className="mx-auto flex max-w-4xl flex-1 flex-col px-4 py-8">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <h1 className="text-3xl font-bold tracking-tight text-white">Your Tasks</h1>
          <span className="inline-flex items-center rounded-full border border-cyan-500/30 bg-cyan-500/10 px-3 py-1 text-xs font-medium text-cyan-400">
            {counts.active} active
          </span>
        </div>
        <button
          onClick={handlePrioritize}
          disabled={prioritize.isPending}
          className="inline-flex items-center gap-2 rounded-lg bg-gradient-to-r from-violet-600 to-blue-600 px-4 py-2.5 text-sm font-semibold text-white shadow-lg shadow-violet-900/30 transition hover:opacity-90 disabled:opacity-60"
        >
          <SparklesIcon className="h-4 w-4" />
          {prioritize.isPending ? "Scoring…" : "AI Re-prioritize"}
        </button>
      </div>

      <div className="mt-6">
        <TaskForm onAiCreated={handleAiCreated} />
      </div>

      {prioritizeError && (
        <p className="mt-3 text-sm text-rose-400">{prioritizeError}</p>
      )}

      <div className="mt-6 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-1">
          {tabs.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setFilter(tab.key)}
              className={`rounded-md px-3 py-1.5 text-sm font-medium transition ${
                filter === tab.key
                  ? "bg-white text-slate-900"
                  : "text-slate-400 hover:text-slate-200"
              }`}
            >
              {tab.label} <span className="opacity-70">{tab.count}</span>
            </button>
          ))}
        </div>
        <span className="text-xs text-slate-500">
          Sorted by: <span className="font-medium text-indigo-400">AI Urgency Matrix</span>
        </span>
      </div>

      <div className="mt-4">
        <TaskList
          tasks={filteredTasks}
          isLoading={isLoading}
          isError={isError}
          error={error}
          aiCreatedIds={aiCreatedIds}
        />
      </div>

      <footer className="mt-auto pt-12 text-center text-xs text-slate-600">
        Powered by Intelligent Context Extraction ·{" "}
        <span className="text-slate-500">Documentation &amp; Prompts</span>
      </footer>
    </div>
  );
}
