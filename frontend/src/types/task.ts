export type Priority = "low" | "medium" | "high";

export interface Task {
  id: string;
  user_id: string;
  title: string;
  description: string | null;
  due_date: string | null;
  priority: Priority;
  ai_priority_score: number | null;
  completed: boolean;
  tags: string | null;
  created_at: string;
  updated_at: string;
}

export interface TaskCreate {
  title: string;
  description?: string | null;
  due_date?: string | null;
  priority?: Priority;
  tags?: string | null;
}

export interface TaskUpdate {
  title?: string;
  description?: string | null;
  due_date?: string | null;
  priority?: Priority;
  completed?: boolean;
  tags?: string | null;
}

export interface ParsedTask {
  title: string;
  description: string | null;
  due_date: string | null;
  priority: Priority;
  tags: string | null;
}

export interface AuthUser {
  id: string;
  email: string;
}
