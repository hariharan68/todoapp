import { describe, expect, it } from "vitest";
import type { Task } from "../types/task";
import {
  allTags,
  isOverdue,
  isToday,
  isUpcoming,
  matchesSearch,
  matchesView,
  sortTasks,
  tagList,
} from "./task-filters";

const HOUR = 60 * 60 * 1000;

function task(overrides: Partial<Task> = {}): Task {
  return {
    id: "t1",
    user_id: "u1",
    title: "Task",
    description: null,
    due_date: null,
    priority: "medium",
    ai_priority_score: null,
    completed: false,
    is_focus: false,
    tags: null,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

const iso = (offsetMs: number) => new Date(Date.now() + offsetMs).toISOString();

describe("date predicates", () => {
  it("treats null and unparseable dates as no date", () => {
    for (const value of [null, "not a date"]) {
      expect(isToday(value)).toBe(false);
      expect(isUpcoming(value)).toBe(false);
    }
  });

  it("recognises today regardless of the hour", () => {
    const noon = new Date();
    noon.setHours(12, 0, 0, 0);
    expect(isToday(noon.toISOString())).toBe(true);
  });

  it("does not count today as upcoming", () => {
    const endOfToday = new Date();
    endOfToday.setHours(23, 59, 0, 0);
    expect(isUpcoming(endOfToday.toISOString())).toBe(false);
  });

  it("counts tomorrow onward as upcoming", () => {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(9, 0, 0, 0);
    expect(isUpcoming(tomorrow.toISOString())).toBe(true);
  });

  it("marks a past due date overdue", () => {
    expect(isOverdue(task({ due_date: iso(-HOUR) }))).toBe(true);
  });

  it("never marks a completed task overdue", () => {
    expect(isOverdue(task({ due_date: iso(-HOUR), completed: true }))).toBe(false);
  });

  it("does not mark a future or undated task overdue", () => {
    expect(isOverdue(task({ due_date: iso(HOUR) }))).toBe(false);
    expect(isOverdue(task())).toBe(false);
  });
});

describe("tags", () => {
  it("splits, trims and drops blanks", () => {
    expect(tagList("work, urgent ,, home")).toEqual(["work", "urgent", "home"]);
    expect(tagList(null)).toEqual([]);
    expect(tagList("   ")).toEqual([]);
  });

  it("collects distinct tags alphabetically", () => {
    const tasks = [task({ tags: "work, home" }), task({ tags: "home, admin" })];
    expect(allTags(tasks)).toEqual(["admin", "home", "work"]);
  });
});

describe("matchesSearch", () => {
  const subject = task({
    title: "Email the client",
    description: "About the Q3 proposal",
    tags: "work",
  });

  it("matches an empty query", () => {
    expect(matchesSearch(subject, "   ")).toBe(true);
  });

  it("matches title, description and tags case-insensitively", () => {
    expect(matchesSearch(subject, "EMAIL")).toBe(true);
    expect(matchesSearch(subject, "q3")).toBe(true);
    expect(matchesSearch(subject, "work")).toBe(true);
  });

  it("rejects a non-match", () => {
    expect(matchesSearch(subject, "invoice")).toBe(false);
  });

  it("handles null description and tags", () => {
    expect(matchesSearch(task({ title: "Bare" }), "bare")).toBe(true);
  });
});

describe("matchesView", () => {
  it("lets everything through on 'all'", () => {
    expect(matchesView(task({ completed: true }), "all")).toBe(true);
  });

  it("selects focus and overdue correctly", () => {
    expect(matchesView(task({ is_focus: true }), "focus")).toBe(true);
    expect(matchesView(task(), "focus")).toBe(false);
    expect(matchesView(task({ due_date: iso(-HOUR) }), "overdue")).toBe(true);
  });
});

describe("sortTasks", () => {
  it("leaves server order untouched for 'manual'", () => {
    const tasks = [task({ id: "a" }), task({ id: "b" })];
    expect(sortTasks(tasks, "manual")).toBe(tasks);
  });

  it("does not mutate the input array", () => {
    const tasks = [task({ id: "b", title: "b" }), task({ id: "a", title: "a" })];
    sortTasks(tasks, "title");
    expect(tasks.map((t) => t.id)).toEqual(["b", "a"]);
  });

  it("sorts due dates soonest first with undated tasks last in every case", () => {
    const soon = task({ id: "soon", due_date: iso(HOUR) });
    const later = task({ id: "later", due_date: iso(48 * HOUR) });
    const undated = task({ id: "undated" });
    const order = sortTasks([undated, later, soon], "due").map((t) => t.id);
    expect(order).toEqual(["soon", "later", "undated"]);
  });

  it("sorts priority semantically, not alphabetically", () => {
    const tasks = [
      task({ id: "low", priority: "low" }),
      task({ id: "high", priority: "high" }),
      task({ id: "medium", priority: "medium" }),
    ];
    expect(sortTasks(tasks, "priority").map((t) => t.id)).toEqual([
      "high",
      "medium",
      "low",
    ]);
  });

  it("sorts unscored tasks last under the AI sort", () => {
    const tasks = [
      task({ id: "none" }),
      task({ id: "low", ai_priority_score: 10 }),
      task({ id: "high", ai_priority_score: 90 }),
    ];
    expect(sortTasks(tasks, "ai").map((t) => t.id)).toEqual(["high", "low", "none"]);
  });
});
