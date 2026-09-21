import { useState, type FormEvent } from "react";
import type { Priority, Task } from "../../types/task";
import { useDeleteTask, useUpdateTask } from "../../hooks/useTasks";
import { CheckIcon, ClockIcon, PencilIcon, SparklesIcon, StarIcon, TrashIcon } from "../icons";
import { DateTimePicker } from "../ui/DateTimePicker";
import { isOverdue, tagList } from "../../lib/task-filters";
import { ConfirmDialog } from "../ui/ConfirmDialog";
import { useToast } from "../../lib/toast-context";

function errorMessage(err: unknown, fallback: string): string {
  return err instanceof Error && err.message ? err.message : fallback;
}

const priorityBadge: Record<Priority, string> = {
  low: "bg-emerald-500/10 text-emerald-400",
  medium: "bg-amber-500/10 text-amber-400",
  high: "bg-rose-500/10 text-rose-400",
};

const priorityDot: Record<Priority, string> = {
  low: "bg-emerald-500",
  medium: "bg-amber-500",
  high: "bg-rose-500",
};

const priorityLabel: Record<Priority, string> = {
  low: "Low Priority",
  medium: "Medium",
  high: "High Priority",
};

function formatDue(due: string | null): string | null {
  if (!due) return null;
  const d = new Date(due);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleString(undefined, {
    weekday: "long",
    hour: "numeric",
    minute: "2-digit",
  });
}

function toDatetimeLocal(due: string | null): string {
  if (!due) return "";
  const d = new Date(due);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(
    d.getHours(),
  )}:${pad(d.getMinutes())}`;
}

export function TaskCard({
  task,
  isAiExtracted = false,
  onTagClick,
  selected = false,
  onSelectChange,
}: {
  task: Task;
  isAiExtracted?: boolean;
  onTagClick?: (tag: string) => void;
  selected?: boolean;
  /** Omitted on pages without bulk selection, which hides the checkbox entirely. */
  onSelectChange?: (id: string, selected: boolean) => void;
}) {
  const updateTask = useUpdateTask();
  const deleteTask = useDeleteTask();
  const { toast } = useToast();
  const [editing, setEditing] = useState(false);
  const [confirming, setConfirming] = useState(false);

  const [title, setTitle] = useState(task.title);
  const [description, setDescription] = useState(task.description ?? "");
  const [dueDate, setDueDate] = useState(toDatetimeLocal(task.due_date));
  const [priority, setPriority] = useState<Priority>(task.priority);
  const [tags, setTags] = useState(task.tags ?? "");

  const due = formatDue(task.due_date);
  const overdue = isOverdue(task);

  const startEdit = () => {
    setTitle(task.title);
    setDescription(task.description ?? "");
    setDueDate(toDatetimeLocal(task.due_date));
    setPriority(task.priority);
    setTags(task.tags ?? "");
    setEditing(true);
  };

  const handleSave = async (e: FormEvent) => {
    e.preventDefault();
    const trimmedTitle = title.trim();
    if (!trimmedTitle) return;
    try {
      await updateTask.mutateAsync({
        id: task.id,
        data: {
          title: trimmedTitle,
          description: description.trim() || null,
          due_date: dueDate ? new Date(dueDate).toISOString() : null,
          priority,
          tags: tags.trim() || null,
        },
      });
      setEditing(false);
    } catch (err) {
      toast({ message: errorMessage(err, "Couldn't save the task."), tone: "error" });
    }
  };

  const toggleCompleted = () => {
    const nextCompleted = !task.completed;
    updateTask.mutate(
      { id: task.id, data: { completed: nextCompleted } },
      {
        onSuccess: () =>
          toast({
            message: nextCompleted ? "Task completed." : "Task reopened.",
            actionLabel: "Undo",
            onAction: () =>
              updateTask.mutate({
                id: task.id,
                data: { completed: !nextCompleted },
              }),
          }),
        onError: (err) =>
          toast({
            message: errorMessage(err, "Couldn't update the task."),
            tone: "error",
          }),
      },
    );
  };

  const confirmDelete = () => {
    setConfirming(false);
    deleteTask.mutate(task.id, {
      onError: (err) =>
        toast({
          message: errorMessage(err, "Couldn't delete the task."),
          tone: "error",
        }),
    });
  };

  if (editing) {
    return (
      <form
        onSubmit={handleSave}
        className="space-y-3 rounded-xl border border-indigo-500/40 bg-slate-900/60 p-4"
      >
        <input
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          required
          className="w-full rounded-md border border-slate-800 bg-slate-950 px-3 py-2 text-sm text-white focus:border-indigo-500/50 focus:outline-none focus:ring-2 focus:ring-indigo-500/30"
        />
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={2}
          placeholder="Description (optional)"
          className="w-full rounded-md border border-slate-800 bg-slate-950 px-3 py-2 text-sm text-slate-200 placeholder-slate-600 focus:border-indigo-500/50 focus:outline-none focus:ring-2 focus:ring-indigo-500/30"
        />
        <div className="grid gap-2 sm:grid-cols-3">
          <DateTimePicker value={dueDate} onChange={setDueDate} placeholder="Due date" />
          <select
            value={priority}
            onChange={(e) => setPriority(e.target.value as Priority)}
            className="rounded-md border border-slate-800 bg-slate-950 px-3 py-2 text-sm text-slate-200 focus:border-indigo-500/50 focus:outline-none focus:ring-2 focus:ring-indigo-500/30"
          >
            <option value="low">Low</option>
            <option value="medium">Medium</option>
            <option value="high">High</option>
          </select>
          <input
            type="text"
            value={tags}
            onChange={(e) => setTags(e.target.value)}
            placeholder="tags"
            className="rounded-md border border-slate-800 bg-slate-950 px-3 py-2 text-sm text-slate-200 placeholder-slate-600 focus:border-indigo-500/50 focus:outline-none focus:ring-2 focus:ring-indigo-500/30"
          />
        </div>
        <div className="flex gap-2">
          <button
            type="submit"
            disabled={updateTask.isPending || !title.trim()}
            className="rounded-md bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-indigo-500 disabled:opacity-60"
          >
            {updateTask.isPending ? "Saving…" : "Save"}
          </button>
          <button
            type="button"
            onClick={() => setEditing(false)}
            className="rounded-md border border-slate-700 px-3 py-1.5 text-xs font-medium text-slate-300 hover:bg-slate-800"
          >
            Cancel
          </button>
        </div>
      </form>
    );
  }

  return (
    <div
      className={`flex items-start gap-3 rounded-xl border bg-slate-900/60 p-4 transition ${
        selected
          ? "border-indigo-500/50"
          : "border-slate-800 hover:border-slate-700"
      }`}
    >
      {/* Recedes until hovered or checked so it never competes with the
          completion toggle beside it. */}
      {onSelectChange && (
        <input
          type="checkbox"
          checked={selected}
          onChange={(e) => onSelectChange(task.id, e.target.checked)}
          aria-label={`Select ${task.title}`}
          className="mt-1 h-3.5 w-3.5 shrink-0 cursor-pointer rounded-sm accent-indigo-500 opacity-30 transition-opacity hover:opacity-100 checked:opacity-100"
        />
      )}
      <button
        type="button"
        onClick={toggleCompleted}
        aria-label={task.completed ? "Mark incomplete" : "Mark complete"}
        className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 transition ${
          task.completed
            ? "border-indigo-500 bg-indigo-500"
            : task.priority === "high"
              ? "border-rose-500/70 hover:border-rose-400"
              : "border-slate-700 hover:border-slate-500"
        }`}
      >
        {task.completed && <CheckIcon className="h-3 w-3 text-white" />}
      </button>

      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <h3
            className={`font-medium ${
              task.completed ? "text-slate-500 line-through" : "text-white"
            }`}
          >
            {task.title}
          </h3>
          <span
            className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium ${
              priorityBadge[task.priority]
            }`}
          >
            <span className={`h-1.5 w-1.5 rounded-full ${priorityDot[task.priority]}`} />
            {priorityLabel[task.priority]}
          </span>
          {tagList(task.tags).map((tag) =>
            onTagClick ? (
              <button
                key={tag}
                type="button"
                onClick={() => onTagClick(tag)}
                aria-label={`Filter by ${tag}`}
                className="rounded-full bg-slate-800 px-2 py-0.5 text-[11px] font-medium text-slate-400 transition hover:bg-slate-700 hover:text-slate-200"
              >
                #{tag}
              </button>
            ) : (
              <span
                key={tag}
                className="rounded-full bg-slate-800 px-2 py-0.5 text-[11px] font-medium text-slate-400"
              >
                #{tag}
              </span>
            ),
          )}
        </div>

        {task.description && (
          <p className="mt-1.5 text-sm text-slate-400">{task.description}</p>
        )}

        <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500">
          {due && (
            <span
              className={`flex items-center gap-1 ${overdue ? "text-rose-400" : ""}`}
            >
              <ClockIcon className="h-3 w-3" /> {due}
              {overdue && " · overdue"}
            </span>
          )}
          {task.ai_priority_score !== null && (
            <span className="flex items-center gap-1 text-cyan-400">
              AI score {task.ai_priority_score}
            </span>
          )}
          {isAiExtracted && (
            <span className="flex items-center gap-1 text-indigo-400">
              <SparklesIcon className="h-3 w-3" /> Extracted automatically
            </span>
          )}
        </div>
      </div>

      <div className="flex shrink-0 items-center gap-1">
        <button
          onClick={() =>
            updateTask.mutate(
              { id: task.id, data: { is_focus: !task.is_focus } },
              {
                onError: (err) =>
                  toast({
                    message: errorMessage(err, "Couldn't update Focus."),
                    tone: "error",
                  }),
              },
            )
          }
          aria-label={task.is_focus ? "Remove from Focus" : "Add to Focus"}
          className={`rounded-md p-1.5 transition hover:bg-slate-800 ${
            task.is_focus ? "text-amber-400" : "text-slate-500 hover:text-slate-200"
          }`}
        >
          <StarIcon className="h-4 w-4" />
        </button>
        <button
          onClick={startEdit}
          aria-label="Edit task"
          className="rounded-md p-1.5 text-slate-500 hover:bg-slate-800 hover:text-slate-200"
        >
          <PencilIcon className="h-4 w-4" />
        </button>
        <button
          onClick={() => setConfirming(true)}
          aria-label="Delete task"
          className="rounded-md p-1.5 text-slate-500 hover:bg-rose-500/10 hover:text-rose-400"
        >
          <TrashIcon className="h-4 w-4" />
        </button>
      </div>

      <ConfirmDialog
        open={confirming}
        title="Delete this task?"
        body={`"${task.title}" will be permanently removed. This can't be undone.`}
        confirmLabel="Delete"
        onConfirm={confirmDelete}
        onCancel={() => setConfirming(false)}
      />
    </div>
  );
}
