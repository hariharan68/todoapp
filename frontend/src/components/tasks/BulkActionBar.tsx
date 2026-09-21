export function BulkActionBar({
  count,
  onComplete,
  onReopen,
  onDelete,
  onClear,
  disabled = false,
}: {
  count: number;
  onComplete: () => void;
  onReopen: () => void;
  onDelete: () => void;
  onClear: () => void;
  disabled?: boolean;
}) {
  if (count === 0) return null;

  return (
    <div className="sticky bottom-4 z-30 mt-3 flex flex-wrap items-center gap-2 rounded-xl border border-slate-800 bg-slate-900 px-4 py-2.5 shadow-2xl shadow-black/50">
      <span className="text-sm font-medium text-slate-200">
        {count} selected
      </span>

      <div className="ml-auto flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={onComplete}
          disabled={disabled}
          className="rounded-md bg-slate-800 px-3 py-1.5 text-sm font-medium text-white transition hover:bg-slate-700 disabled:opacity-60"
        >
          Complete
        </button>
        <button
          type="button"
          onClick={onReopen}
          disabled={disabled}
          className="rounded-md border border-slate-700 px-3 py-1.5 text-sm font-medium text-slate-300 transition hover:bg-slate-800 disabled:opacity-60"
        >
          Reopen
        </button>
        <button
          type="button"
          onClick={onDelete}
          disabled={disabled}
          className="rounded-md px-3 py-1.5 text-sm font-medium text-slate-400 transition hover:bg-rose-500/10 hover:text-rose-400 disabled:opacity-60"
        >
          Delete
        </button>
        <button
          type="button"
          onClick={onClear}
          className="rounded-md px-3 py-1.5 text-sm font-medium text-slate-500 transition hover:text-slate-300"
        >
          Clear
        </button>
      </div>
    </div>
  );
}
