import { useState, type FormEvent } from "react";
import { useCreateTask, useParseTask } from "../../hooks/useTasks";
import type { Priority, Task } from "../../types/task";
import { DotIcon, PencilIcon, PlusIcon } from "../icons";

export function TaskForm({
  onAiCreated,
}: {
  onAiCreated?: (task: Task) => void;
}) {
  const createTask = useCreateTask();
  const parseTask = useParseTask();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [priority, setPriority] = useState<Priority>("medium");
  const [tags, setTags] = useState("");
  const [aiText, setAiText] = useState("");
  const [showManual, setShowManual] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError(null);
    const trimmedTitle = title.trim();
    if (!trimmedTitle) return;

    try {
      await createTask.mutateAsync({
        title: trimmedTitle,
        description: description.trim() || null,
        due_date: dueDate ? new Date(dueDate).toISOString() : null,
        priority,
        tags: tags.trim() || null,
      });
      setTitle("");
      setDescription("");
      setDueDate("");
      setPriority("medium");
      setTags("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to add task");
    }
  };

  const handleAiSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError(null);
    const trimmedText = aiText.trim();
    if (!trimmedText) return;

    try {
      const task = await parseTask.mutateAsync(trimmedText);
      onAiCreated?.(task);
      setAiText("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "AI analysis failed");
    }
  };

  return (
    <div className="space-y-2">
      <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4">
        <form onSubmit={handleAiSubmit} className="flex items-center gap-3">
          <PencilIcon className="h-4 w-4 shrink-0 text-slate-500" />
          <input
            type="text"
            value={aiText}
            onChange={(e) => setAiText(e.target.value)}
            placeholder='e.g. "Email the client the proposal by Friday 5pm — high priority"'
            className="flex-1 bg-transparent text-sm text-slate-200 placeholder-slate-500 focus:outline-none"
          />
          <button
            type="submit"
            disabled={parseTask.isPending || !aiText.trim()}
            className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-slate-800 px-3.5 py-2 text-sm font-medium text-white transition hover:bg-slate-700 disabled:opacity-50"
          >
            <PlusIcon className="h-4 w-4" />
            {parseTask.isPending ? "Adding…" : "Add with AI"}
          </button>
        </form>
        <div className="mt-3 flex flex-col gap-1.5 text-xs text-slate-500 sm:flex-row sm:items-center sm:justify-between">
          <span className="flex items-center gap-1.5">
            <DotIcon className="h-1.5 w-1.5 text-indigo-400" />
            Describe the task in plain language — AI extracts the title, due date,
            priority and tags.
          </span>
          <span className="hidden items-center gap-1.5 sm:flex">
            Press{" "}
            <kbd className="rounded border border-slate-700 bg-slate-800 px-1.5 py-0.5 font-mono text-[10px] text-slate-300">
              Enter ↵
            </kbd>
          </span>
        </div>
      </div>

      <button
        type="button"
        onClick={() => setShowManual((v) => !v)}
        className="text-xs font-medium text-slate-500 hover:text-slate-300"
      >
        {showManual ? "Hide manual form" : "+ Add task manually"}
      </button>

      {showManual && (
        <form
          onSubmit={handleSubmit}
          className="space-y-3 rounded-xl border border-slate-800 bg-slate-900/60 p-4"
        >
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Task title"
            required
            className="w-full rounded-md border border-slate-800 bg-slate-950 px-3 py-2 text-sm text-white placeholder-slate-600 focus:border-indigo-500/50 focus:outline-none focus:ring-2 focus:ring-indigo-500/30"
          />
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Description (optional)"
            rows={2}
            className="w-full rounded-md border border-slate-800 bg-slate-950 px-3 py-2 text-sm text-slate-200 placeholder-slate-600 focus:border-indigo-500/50 focus:outline-none focus:ring-2 focus:ring-indigo-500/30"
          />
          <div className="grid gap-3 sm:grid-cols-3">
            <label className="text-sm text-slate-500">
              Due date
              <input
                type="datetime-local"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
                className="mt-1 w-full rounded-md border border-slate-800 bg-slate-950 px-3 py-2 text-slate-200 focus:border-indigo-500/50 focus:outline-none focus:ring-2 focus:ring-indigo-500/30"
              />
            </label>
            <label className="text-sm text-slate-500">
              Priority
              <select
                value={priority}
                onChange={(e) => setPriority(e.target.value as Priority)}
                className="mt-1 w-full rounded-md border border-slate-800 bg-slate-950 px-3 py-2 text-slate-200 focus:border-indigo-500/50 focus:outline-none focus:ring-2 focus:ring-indigo-500/30"
              >
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
              </select>
            </label>
            <label className="text-sm text-slate-500">
              Tags
              <input
                type="text"
                value={tags}
                onChange={(e) => setTags(e.target.value)}
                placeholder="work, study"
                className="mt-1 w-full rounded-md border border-slate-800 bg-slate-950 px-3 py-2 text-slate-200 placeholder-slate-600 focus:border-indigo-500/50 focus:outline-none focus:ring-2 focus:ring-indigo-500/30"
              />
            </label>
          </div>
          <button
            type="submit"
            disabled={createTask.isPending || !title.trim()}
            className="rounded-md bg-slate-800 px-4 py-2 text-sm font-medium text-white transition hover:bg-slate-700 disabled:opacity-60"
          >
            {createTask.isPending ? "Adding..." : "Add task"}
          </button>
        </form>
      )}

      {error && <p className="text-sm text-rose-400">{error}</p>}
    </div>
  );
}
