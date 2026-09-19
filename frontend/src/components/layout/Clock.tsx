import { useEffect, useState } from "react";

export function Clock() {
  // 1. State holds the current moment. The function form runs once, at first render.
  const [now, setNow] = useState<Date>(() => new Date());

  // 2. The timer: start on mount, tick every 1000ms, clean up on unmount.
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id); // cleanup — prevents a leaked timer
  }, []); // empty deps = run once

  // 3. Format for display (uses the browser's locale + timezone automatically).
  const time = now.toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  const date = now.toLocaleDateString([], {
    weekday: "short",
    day: "numeric",
    month: "short",
  });

  return (
    <div className="hidden items-center gap-2 rounded-lg border border-slate-800 bg-slate-900/60 px-3 py-1.5 md:flex">
      <svg
        className="h-3.5 w-3.5 text-indigo-400"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <circle cx="12" cy="12" r="9" />
        <path d="M12 7v5l3 2" />
      </svg>
      <span className="font-mono text-xs tabular-nums text-slate-200">{time}</span>
      <span className="text-xs text-slate-500">{date}</span>
    </div>
  );
}