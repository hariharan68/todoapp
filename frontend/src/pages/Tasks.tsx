import { useMemo, useState } from "react";
import { ManualTaskForm } from "../components/tasks/ManualTaskForm";
import { TaskList } from "../components/tasks/TaskList";
import { useTasks } from "../hooks/useTasks";
import type { Task } from "../types/task";

type Filter = "all" | "today" | "upcoming" | "focus";

function sortByUrgency(tasks: Task[]): Task[] {
  const hasScores = tasks.some((t) => t.ai_priority_score !== null);
  if (!hasScores) return tasks;
  return [...tasks].sort(
    (a, b) => (b.ai_priority_score ?? -1) - (a.ai_priority_score ?? -1),
  );
}

// due date falls on today's calendar day (local time)
function isToday(dateStr: string | null): boolean {
  if (!dateStr) return false;
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return false;
  const now = new Date();
  return (
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate()
  );
}

// due date is tomorrow (start of day) or later
function isUpcoming(dateStr: string | null): boolean {
  if (!dateStr) return false;
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return false;
  const startOfTomorrow = new Date();
  startOfTomorrow.setHours(0, 0, 0, 0);
  startOfTomorrow.setDate(startOfTomorrow.getDate() + 1);
  return d.getTime() >= startOfTomorrow.getTime();
}

export function Tasks() {
  const { data, isLoading, isError, error } = useTasks();
  const [filter, setFilter] = useState<Filter>("all");

  const tasks = useMemo(() => sortByUrgency(data ?? []), [data]);

  const counts = useMemo(
    () => ({
      all: tasks.length,
      active: tasks.filter((t) => !t.completed).length,
      today: tasks.filter((t) => isToday(t.due_date)).length,
      upcoming: tasks.filter((t) => isUpcoming(t.due_date)).length,
      focus: tasks.filter((t) => t.is_focus).length,
    }),
    [tasks],
  );

  const filteredTasks = useMemo(() => {
    switch (filter) {
      case "today":
        return tasks.filter((t) => isToday(t.due_date));
      case "upcoming":
        return tasks.filter((t) => isUpcoming(t.due_date));
      case "focus":
        return tasks.filter((t) => t.is_focus);
      default:
        return tasks;
    }
  }, [tasks, filter]);

  const tabs: { key: Filter; label: string; count: number }[] = [
    { key: "all", label: "All Tasks", count: counts.all },
    { key: "today", label: "Today's Task", count: counts.today },
    { key: "upcoming", label: "Upcoming", count: counts.upcoming },
    { key: "focus", label: "Focus", count: counts.focus },
  ];

  return (
    <div className="mx-auto w-full max-w-6xl px-6 py-8">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-3xl font-bold tracking-tight text-white">Your Tasks</h1>
        <span className="inline-flex items-center rounded-full border border-cyan-500/30 bg-cyan-500/10 px-3 py-1 text-xs font-medium text-cyan-400">
          {counts.active} active
        </span>
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
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap items-center gap-1">
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
              Sorted by:{" "}
              <span className="font-medium text-indigo-400">AI Urgency Matrix</span>
            </span>
          </div>

          <div className="mt-4">
            <TaskList
              tasks={filteredTasks}
              isLoading={isLoading}
              isError={isError}
              error={error}
              aiCreatedIds={new Set<string>()}
            />
          </div>
        </section>
      </div>

      <footer className="mt-12 text-center text-xs text-slate-600">
        Powered by Intelligent Context Extraction ·{" "}
        <span className="text-slate-500">Documentation &amp; Prompts</span>
      </footer>
    </div>
  );
}