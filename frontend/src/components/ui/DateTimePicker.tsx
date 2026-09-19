import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronLeftIcon, ChevronRightIcon, ClockIcon } from "../icons";

const WEEKDAYS = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];
const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

const pad = (n: number) => String(n).padStart(2, "0");

/** Serialize to the `datetime-local` shape the API layer already expects. */
function toValue(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(
    d.getHours(),
  )}:${pad(d.getMinutes())}`;
}

function parseValue(v: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(v);
  if (!m) return null;
  const d = new Date(+m[1], +m[2] - 1, +m[3], +m[4], +m[5]);
  return Number.isNaN(d.getTime()) ? null : d;
}

const sameDay = (a: Date, b: Date) =>
  a.getFullYear() === b.getFullYear() &&
  a.getMonth() === b.getMonth() &&
  a.getDate() === b.getDate();

/** 42 cells so the grid height never jumps between months. */
function buildGrid(view: Date): Date[] {
  const first = new Date(view.getFullYear(), view.getMonth(), 1);
  const start = new Date(first);
  start.setDate(first.getDate() - first.getDay());
  return Array.from({ length: 42 }, (_, i) => {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    return d;
  });
}

export function DateTimePicker({
  value,
  onChange,
  placeholder = "Pick a date & time",
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}) {
  const selected = useMemo(() => parseValue(value), [value]);
  const [open, setOpen] = useState(false);
  const [view, setView] = useState<Date>(() => selected ?? new Date());
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (selected) setView(new Date(selected.getFullYear(), selected.getMonth(), 1));
  }, [value]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  const today = new Date();
  const grid = useMemo(() => buildGrid(view), [view]);

  // Keep the trigger label short — it often sits in a narrow column. The year is
  // only worth showing when it isn't the current one.
  const label = selected
    ? `${selected.toLocaleDateString(undefined, {
        day: "numeric",
        month: "short",
        ...(selected.getFullYear() === today.getFullYear() ? {} : { year: "numeric" }),
      })}, ${selected.toLocaleTimeString(undefined, {
        hour: "numeric",
        minute: "2-digit",
      })}`
    : placeholder;

  const commit = (d: Date) => onChange(toValue(d));

  const pickDay = (day: Date) => {
    const h = selected ? selected.getHours() : 9;
    const m = selected ? selected.getMinutes() : 0;
    commit(new Date(day.getFullYear(), day.getMonth(), day.getDate(), h, m));
  };

  const setTime = (hours: number, minutes: number) => {
    const base = selected ?? today;
    commit(new Date(base.getFullYear(), base.getMonth(), base.getDate(), hours, minutes));
  };

  const shiftMonth = (delta: number) =>
    setView((v) => new Date(v.getFullYear(), v.getMonth() + delta, 1));

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="dialog"
        aria-expanded={open}
        className={`flex w-full items-center justify-between gap-2 rounded-md border bg-slate-950 px-3 py-2 text-left text-sm transition focus:outline-none focus:ring-2 focus:ring-indigo-500/30 ${
          open ? "border-indigo-500/60" : "border-slate-800 hover:border-slate-700"
        } ${selected ? "text-slate-200" : "text-slate-600"}`}
      >
        <span className="truncate">{label}</span>
        <ClockIcon className="h-4 w-4 shrink-0 text-slate-500" />
      </button>

      {open && (
        <div
          role="dialog"
          aria-label="Choose date and time"
          className="absolute left-0 z-30 mt-2 w-[278px] rounded-xl border border-slate-800 bg-slate-900 p-3 shadow-2xl shadow-black/50"
        >
          {/* Month navigation */}
          <div className="mb-2 flex items-center justify-between">
            <button
              type="button"
              onClick={() => shiftMonth(-1)}
              aria-label="Previous month"
              className="rounded-md p-1.5 text-slate-400 transition hover:bg-slate-800 hover:text-white"
            >
              <ChevronLeftIcon className="h-4 w-4" />
            </button>
            <span className="text-sm font-medium text-white">
              {MONTHS[view.getMonth()]} {view.getFullYear()}
            </span>
            <button
              type="button"
              onClick={() => shiftMonth(1)}
              aria-label="Next month"
              className="rounded-md p-1.5 text-slate-400 transition hover:bg-slate-800 hover:text-white"
            >
              <ChevronRightIcon className="h-4 w-4" />
            </button>
          </div>

          {/* Weekday header */}
          <div className="grid grid-cols-7 gap-0.5">
            {WEEKDAYS.map((w) => (
              <div
                key={w}
                className="py-1 text-center text-[11px] font-medium text-slate-500"
              >
                {w}
              </div>
            ))}
          </div>

          {/* Day grid */}
          <div className="grid grid-cols-7 gap-0.5">
            {grid.map((day) => {
              const outside = day.getMonth() !== view.getMonth();
              const isSelected = selected ? sameDay(day, selected) : false;
              const isToday = sameDay(day, today);
              return (
                <button
                  key={day.toISOString()}
                  type="button"
                  onClick={() => pickDay(day)}
                  className={`h-8 rounded-md text-[13px] transition ${
                    isSelected
                      ? "bg-indigo-600 font-semibold text-white"
                      : outside
                        ? "text-slate-700 hover:bg-slate-800/60 hover:text-slate-400"
                        : "text-slate-300 hover:bg-slate-800"
                  } ${!isSelected && isToday ? "ring-1 ring-inset ring-indigo-500/50" : ""}`}
                >
                  {day.getDate()}
                </button>
              );
            })}
          </div>

          {/* Time */}
          <div className="mt-3 flex items-center gap-2 border-t border-slate-800 pt-3">
            <ClockIcon className="h-3.5 w-3.5 shrink-0 text-slate-500" />
            <select
              aria-label="Hour"
              value={selected ? selected.getHours() : 9}
              onChange={(e) => setTime(+e.target.value, selected ? selected.getMinutes() : 0)}
              className="flex-1 rounded-md border border-slate-800 bg-slate-950 px-2 py-1.5 text-sm text-slate-200 focus:border-indigo-500/60 focus:outline-none"
            >
              {Array.from({ length: 24 }, (_, h) => (
                <option key={h} value={h}>
                  {pad(h)}
                </option>
              ))}
            </select>
            <span className="text-slate-600">:</span>
            <select
              aria-label="Minute"
              value={selected ? selected.getMinutes() : 0}
              onChange={(e) => setTime(selected ? selected.getHours() : 9, +e.target.value)}
              className="flex-1 rounded-md border border-slate-800 bg-slate-950 px-2 py-1.5 text-sm text-slate-200 focus:border-indigo-500/60 focus:outline-none"
            >
              {Array.from({ length: 60 }, (_, m) => (
                <option key={m} value={m}>
                  {pad(m)}
                </option>
              ))}
            </select>
          </div>

          {/* Footer actions */}
          <div className="mt-3 flex items-center justify-between border-t border-slate-800 pt-3">
            <button
              type="button"
              onClick={() => {
                onChange("");
                setOpen(false);
              }}
              className="rounded-md px-2 py-1 text-xs font-medium text-slate-500 transition hover:text-slate-300"
            >
              Clear
            </button>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => {
                  const now = new Date();
                  commit(new Date(now.getFullYear(), now.getMonth(), now.getDate(), 9, 0));
                }}
                className="rounded-md px-2 py-1 text-xs font-medium text-indigo-400 transition hover:text-indigo-300"
              >
                Today
              </button>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="rounded-md bg-indigo-600 px-3 py-1 text-xs font-semibold text-white transition hover:bg-indigo-500"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
