import type { Priority, Task } from "../types/task";

// Pure helpers behind the task list's filtering, searching and sorting.
// Kept free of React so they can be unit-tested directly.

export type TaskView = "all" | "today" | "upcoming" | "overdue" | "focus";

export type SortKey = "manual" | "due" | "priority" | "title" | "ai";

export const SORT_LABELS: Record<SortKey, string> = {
  manual: "Date added",
  due: "Due date",
  priority: "Priority",
  title: "Title A–Z",
  ai: "AI Urgency Matrix",
};

// high sorts before medium before low — alphabetical order would be nonsense.
const priorityRank: Record<Priority, number> = { high: 0, medium: 1, low: 2 };

function parseDate(dateStr: string | null): Date | null {
  if (!dateStr) return null;
  const d = new Date(dateStr);
  return Number.isNaN(d.getTime()) ? null : d;
}

// due date falls on today's calendar day (local time)
export function isToday(dateStr: string | null): boolean {
  const d = parseDate(dateStr);
  if (!d) return false;
  const now = new Date();
  return (
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate()
  );
}

// due date is tomorrow (start of day) or later
export function isUpcoming(dateStr: string | null): boolean {
  const d = parseDate(dateStr);
  if (!d) return false;
  const startOfTomorrow = new Date();
  startOfTomorrow.setHours(0, 0, 0, 0);
  startOfTomorrow.setDate(startOfTomorrow.getDate() + 1);
  return d.getTime() >= startOfTomorrow.getTime();
}

// past its due moment and not yet done — a completed task is never overdue
export function isOverdue(task: Task): boolean {
  if (task.completed) return false;
  const d = parseDate(task.due_date);
  if (!d) return false;
  return d.getTime() < Date.now();
}

export function tagList(tags: string | null): string[] {
  if (!tags) return [];
  return tags
    .split(",")
    .map((t) => t.trim())
    .filter(Boolean);
}

// every distinct tag across the given tasks, alphabetical
export function allTags(tasks: Task[]): string[] {
  const seen = new Set<string>();
  for (const task of tasks) {
    for (const tag of tagList(task.tags)) seen.add(tag);
  }
  return [...seen].sort((a, b) => a.localeCompare(b));
}

export function matchesSearch(task: Task, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return (
    task.title.toLowerCase().includes(q) ||
    (task.description ?? "").toLowerCase().includes(q) ||
    (task.tags ?? "").toLowerCase().includes(q)
  );
}

export function matchesView(task: Task, view: TaskView): boolean {
  switch (view) {
    case "today":
      return isToday(task.due_date);
    case "upcoming":
      return isUpcoming(task.due_date);
    case "overdue":
      return isOverdue(task);
    case "focus":
      return task.is_focus;
    default:
      return true;
  }
}

// Undated tasks sort last whichever direction you read the dates in, so they
// never crowd out the tasks that actually have a deadline.
function byDue(a: Task, b: Task): number {
  const da = parseDate(a.due_date);
  const db = parseDate(b.due_date);
  if (!da && !db) return 0;
  if (!da) return 1;
  if (!db) return -1;
  return da.getTime() - db.getTime();
}

function byCreatedDesc(a: Task, b: Task): number {
  return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
}

export function comparatorFor(sort: SortKey): (a: Task, b: Task) => number {
  switch (sort) {
    case "due":
      return (a, b) => byDue(a, b) || byCreatedDesc(a, b);
    case "priority":
      return (a, b) =>
        priorityRank[a.priority] - priorityRank[b.priority] || byCreatedDesc(a, b);
    case "title":
      return (a, b) => a.title.localeCompare(b.title) || byCreatedDesc(a, b);
    case "ai":
      return (a, b) =>
        (b.ai_priority_score ?? -1) - (a.ai_priority_score ?? -1) ||
        byCreatedDesc(a, b);
    default:
      return byCreatedDesc;
  }
}

// The list arrives from the server already in created_at desc order, so
// "manual" needs no re-sort; the rest get a stable copy.
export function sortTasks(tasks: Task[], sort: SortKey): Task[] {
  if (sort === "manual") return tasks;
  return [...tasks].sort(comparatorFor(sort));
}
