import {
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { apiClient } from "../lib/api-client";
import type { TaskCreate, TaskUpdate } from "../types/task";

const TASKS_KEY = ["tasks"] as const;

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
    onSuccess: () => qc.invalidateQueries({ queryKey: TASKS_KEY }),
  });
}

export function useDeleteTask() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiClient.deleteTask(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: TASKS_KEY }),
  });
}

export function usePrioritize() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => apiClient.prioritize(),
    onSuccess: () => qc.invalidateQueries({ queryKey: TASKS_KEY }),
  });
}
