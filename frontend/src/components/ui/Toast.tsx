import { XIcon } from "../icons";

export interface ToastItem {
  id: number;
  message: string;
  tone: "info" | "error";
  actionLabel?: string;
  onAction?: () => void;
}

export function ToastViewport({
  toasts,
  onDismiss,
}: {
  toasts: ToastItem[];
  onDismiss: (id: number) => void;
}) {
  if (toasts.length === 0) return null;

  return (
    <div
      aria-live="polite"
      className="pointer-events-none fixed inset-x-0 bottom-4 z-50 flex flex-col items-center gap-2 px-4"
    >
      {toasts.map((toast) => (
        <div
          key={toast.id}
          role={toast.tone === "error" ? "alert" : "status"}
          className={`pointer-events-auto flex w-full max-w-md items-center gap-3 rounded-xl border bg-slate-900 px-4 py-3 text-sm shadow-2xl shadow-black/50 ${
            toast.tone === "error"
              ? "border-rose-500/40 text-rose-300"
              : "border-slate-800 text-slate-200"
          }`}
        >
          <span className="min-w-0 flex-1">{toast.message}</span>

          {toast.actionLabel && toast.onAction && (
            <button
              type="button"
              onClick={() => {
                toast.onAction?.();
                onDismiss(toast.id);
              }}
              className="shrink-0 rounded-md px-2 py-1 text-xs font-semibold text-indigo-400 transition hover:bg-slate-800 hover:text-indigo-300"
            >
              {toast.actionLabel}
            </button>
          )}

          <button
            type="button"
            onClick={() => onDismiss(toast.id)}
            aria-label="Dismiss"
            className="shrink-0 rounded-md p-1 text-slate-500 transition hover:bg-slate-800 hover:text-slate-300"
          >
            <XIcon className="h-3.5 w-3.5" />
          </button>
        </div>
      ))}
    </div>
  );
}
