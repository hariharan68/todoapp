import { useState, type FormEvent } from "react";
import { useCreateTask } from "../../hooks/useTasks";
import type { Priority } from "../../types/task";
import { DateTimePicker } from "../ui/DateTimePicker";

export function ManualTaskForm() {
  const createTask = useCreateTask();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [priority, setPriority] = useState<Priority>("medium");
  const [tags, setTags] = useState("");
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

  return (
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
      <div className="text-sm text-slate-500">
        Due date
        <div className="mt-1">
          <DateTimePicker value={dueDate} onChange={setDueDate} />
        </div>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
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
      {error && <p className="text-sm text-rose-400">{error}</p>}
    </form>
  );
}