import type { Task } from "../../types/task";
import { TaskCard } from "./TaskCard";

interface TaskListProps {
  tasks: Task[];
  isLoading: boolean;
  isError: boolean;
  error: unknown;
  aiCreatedIds: Set<string>;
}

export function TaskList({ tasks, isLoading, isError, error, aiCreatedIds }: TaskListProps) {
  if (isLoading) {
    return <p className="py-8 text-center text-sm text-slate-500">Loading tasks…</p>;
  }

  if (isError) {
    return (
      <p className="py-8 text-center text-sm text-rose-400">
        Failed to load tasks: {error instanceof Error ? error.message : "error"}
      </p>
    );
  }

  if (tasks.length === 0) {
    return (
      <p className="py-8 text-center text-sm text-slate-500">
        No tasks here. Add one above using natural language.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      {tasks.map((task) => (
        <TaskCard key={task.id} task={task} isAiExtracted={aiCreatedIds.has(task.id)} />
      ))}
    </div>
  );
}
