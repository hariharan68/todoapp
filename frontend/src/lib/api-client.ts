import type {
  AuthUser,
  ParsedTask,
  Task,
  TaskCreate,
  TaskUpdate,
} from "../types/task";

const API_URL = import.meta.env.VITE_API_URL ?? "http://localhost:8005";

export const TOKEN_KEY = "ai_todo_token";

interface Token {
  access_token: string;
  token_type: string;
}

function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

async function request<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const headers = new Headers(options.headers);
  headers.set("Content-Type", "application/json");
  const token = getToken();
  if (token) {
    headers.set("Authorization", `Bearer ${token}`);
  }

  const res = await fetch(`${API_URL}${path}`, { ...options, headers });

  if (res.status === 401) {
    let detail = "Unauthorized";
    try {
      const body = await res.json();
      if (body?.detail) {
        detail =
          typeof body.detail === "string" ? body.detail : JSON.stringify(body.detail);
      }
    } catch {
      // keep the default message
    }

    localStorage.removeItem(TOKEN_KEY);
    // On the auth pages a 401 means bad credentials, so let the form show the
    // reason instead of reloading the page out from under it.
    const path = window.location.pathname;
    if (path !== "/login" && path !== "/signup") {
      window.location.href = "/login";
    }
    throw new ApiError(401, detail);
  }

  if (!res.ok) {
    let detail = res.statusText;
    try {
      const body = await res.json();
      if (body?.detail) {
        detail =
          typeof body.detail === "string"
            ? body.detail
            : JSON.stringify(body.detail);
      }
    } catch {
      // ignore parse errors, keep statusText
    }
    throw new ApiError(res.status, detail);
  }

  if (res.status === 204) {
    return undefined as T;
  }
  return (await res.json()) as T;
}

export const apiClient = {
  // ----- Auth -----
  signup: (email: string, password: string) =>
    request<Token>("/auth/signup", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    }),

  login: (email: string, password: string) =>
    request<Token>("/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    }),

  getMe: () => request<AuthUser>("/auth/me"),

  // ----- Tasks -----
  listTasks: (completed?: boolean) => {
    const q =
      completed === undefined ? "" : `?completed=${completed ? "true" : "false"}`;
    return request<Task[]>(`/tasks/${q}`);
  },

  createTask: (data: TaskCreate) =>
    request<Task>("/tasks/", {
      method: "POST",
      body: JSON.stringify(data),
    }),

  updateTask: (id: string, data: TaskUpdate) =>
    request<Task>(`/tasks/${id}`, {
      method: "PATCH",
      body: JSON.stringify(data),
    }),

  deleteTask: (id: string) =>
    request<void>(`/tasks/${id}`, { method: "DELETE" }),

  // ----- AI -----
  parseText: (text: string) =>
    request<Task>("/parse/", {
      method: "POST",
      body: JSON.stringify({ text }),
    }),

  previewParse: (text: string) =>
    request<ParsedTask>("/parse/preview", {
      method: "POST",
      body: JSON.stringify({ text }),
    }),

  prioritize: () => request<Task[]>("/prioritize/", { method: "POST" }),

  chat: (message: string) =>
    request<{ reply: string }>("/chat/", {
      method: "POST",
      body: JSON.stringify({ message }),
    }),
};

export { ApiError };
