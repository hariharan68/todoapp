import {
  useMutation,
  useQuery,
  useQueryClient,
  type QueryClient,
  type QueryKey,
} from "@tanstack/react-query";
import { apiClient } from "../lib/api-client";
import type {
  BulkTaskAction,
  Task,
  TaskCreate,
  TaskUpdate,
} from "../types/task";

const TASKS_KEY = ["tasks"] as const;

type TasksSnapshot = [QueryKey, Task[] | undefined][];

/**
 * useTasks keys on ["tasks", { completed }], so optimistic writers must use the
 * plural setQueriesData/getQueriesData to reach every cached variant — writing
 * to ["tasks"] alone would land on a key nothing is subscribed to.
 */
async function snapshotTasks(qc: QueryClient): Promise<TasksSnapshot> {
  await qc.cancelQueries({ queryKey: TASKS_KEY });
  return qc.getQueriesData<Task[]>({ queryKey: TASKS_KEY });
}

function restoreTasks(qc: QueryClient, snapshot: TasksSnapshot | undefined) {
  if (!snapshot) return;
  for (const [key, value] of snapshot) qc.setQueryData(key, value);
}

function writeTasks(qc: QueryClient, update: (tasks: Task[]) => Task[]) {
  qc.setQueriesData<Task[]>({ queryKey: TASKS_KEY }, (old) =>
    old ? update(old) : old,
  );
}

export function useTasks(completed?: boolean) {
  return useQuery({
    queryKey: [...TASKS_KEY, { completed }],
    queryFn: () => apiClient.listTasks(completed),
  });
}

export function useCreateTask() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: TaskCreate) => apiClient.createTask(data),
    onSuccess: () => qc.invalidateQueries({ queryKey: TASKS_KEY }),
  });
}

export function useParseTask() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (text: string) => apiClient.parseText(text),
    onSuccess: () => qc.invalidateQueries({ queryKey: TASKS_KEY }),
  });
}

export function useUpdateTask() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: TaskUpdate }) =>
      apiClient.updateTask(id, data),
    // Applied locally first so ticking a checkbox is instant; rolled back if
    // the request fails.
    onMutate: async ({ id, data }) => {
      const snapshot = await snapshotTasks(qc);
      writeTasks(qc, (tasks) =>
        tasks.map((t) => (t.id === id ? { ...t, ...data } : t)),
      );
      return { snapshot };
    },
    onError: (_error, _vars, context) => restoreTasks(qc, context?.snapshot),
    onSettled: () => qc.invalidateQueries({ queryKey: TASKS_KEY }),
  });
}

export function useDeleteTask() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiClient.deleteTask(id),
    onMutate: async (id) => {
      const snapshot = await snapshotTasks(qc);
      writeTasks(qc, (tasks) => tasks.filter((t) => t.id !== id));
      return { snapshot };
    },
    onError: (_error, _vars, context) => restoreTasks(qc, context?.snapshot),
    onSettled: () => qc.invalidateQueries({ queryKey: TASKS_KEY }),
  });
}

export function useBulkTasks() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ ids, action }: { ids: string[]; action: BulkTaskAction }) =>
      apiClient.bulkTasks(ids, action),
    onMutate: async ({ ids, action }) => {
      const snapshot = await snapshotTasks(qc);
      const target = new Set(ids);
      writeTasks(qc, (tasks) =>
        action === "delete"
          ? tasks.filter((t) => !target.has(t.id))
          : tasks.map((t) =>
              target.has(t.id) ? { ...t, completed: action === "complete" } : t,
            ),
      );
      return { snapshot };
    },
    onError: (_error, _vars, context) => restoreTasks(qc, context?.snapshot),
    onSettled: () => qc.invalidateQueries({ queryKey: TASKS_KEY }),
  });
}

export function usePrioritize() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => apiClient.prioritize(),
    onSuccess: () => qc.invalidateQueries({ queryKey: TASKS_KEY }),
  });
}
