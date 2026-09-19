import { useMemo, useState } from "react";
import { AiTaskForm } from "../components/tasks/AiTaskForm";
import { TaskList } from "../components/tasks/TaskList";
import { usePrioritize, useTasks } from "../hooks/useTasks";
import type { Task } from "../types/task";
import { SparklesIcon } from "../components/icons";

function sortByUrgency(tasks: Task[]): Task[] {
  const hasScores = tasks.some((t) => t.ai_priority_score !== null);
  if (!hasScores) return tasks;
  return [...tasks].sort(
    (a, b) => (b.ai_priority_score ?? -1) - (a.ai_priority_score ?? -1),
  );
}

export function AiAdd() {
  const { data, isLoading, isError, error } = useTasks();
  const prioritize = usePrioritize();
  const [prioritizeError, setPrioritizeError] = useState<string | null>(null);
  const [aiCreatedIds, setAiCreatedIds] = useState<Set<string>>(new Set());

  const tasks = useMemo(() => sortByUrgency(data ?? []), [data]);

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

  return (
    <div className="mx-auto w-full max-w-screen-2xl px-6 py-8">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="flex items-center gap-2 text-3xl font-bold tracking-tight text-white">
          <SparklesIcon className="h-6 w-6 text-indigo-400" />
          AI Task Assistant
        </h1>
        <button
          onClick={handlePrioritize}
          disabled={prioritize.isPending}
          className="inline-flex items-center gap-2 rounded-lg bg-gradient-to-r from-violet-600 to-blue-600 px-4 py-2.5 text-sm font-semibold text-white shadow-lg shadow-violet-900/30 transition hover:opacity-90 disabled:opacity-60"
        >
          <SparklesIcon className="h-4 w-4" />
          {prioritize.isPending ? "Scoring…" : "AI Re-prioritize"}
        </button>
      </div>

      <p className="mt-2 text-sm text-slate-400">
        Describe a task in plain English — AI extracts the title, due date, priority
        and tags. Needs an Anthropic API key configured on the server.
      </p>

      {prioritizeError && (
        <p className="mt-3 text-sm text-rose-400">{prioritizeError}</p>
      )}

      <div className="mt-6">
        <AiTaskForm onAiCreated={handleAiCreated} />
      </div>

      <div className="mt-8">
        <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-slate-400">
          Your tasks
        </h2>
        <TaskList
          tasks={tasks}
          isLoading={isLoading}
          isError={isError}
          error={error}
          aiCreatedIds={aiCreatedIds}
        />
      </div>
    </div>
  );
}