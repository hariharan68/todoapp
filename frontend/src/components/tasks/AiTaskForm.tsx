import { useState, type FormEvent } from "react";
import { useParseTask } from "../../hooks/useTasks";
import type { Task } from "../../types/task";
import { DotIcon, PencilIcon, PlusIcon } from "../icons";

export function AiTaskForm({
  onAiCreated,
}: {
  onAiCreated?: (task: Task) => void;
}) {
  const parseTask = useParseTask();
  const [aiText, setAiText] = useState("");
  const [error, setError] = useState<string | null>(null);

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
      {error && <p className="text-sm text-rose-400">{error}</p>}
    </div>
  );
}