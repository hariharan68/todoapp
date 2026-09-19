import type { ComponentType, ReactNode, SVGProps } from "react";
import { ChatIcon, SparklesIcon, StarIcon, TrendingUpIcon } from "../icons";

const FEATURES: {
  icon: ComponentType<SVGProps<SVGSVGElement>>;
  accent: string;
  title: string;
  description: string;
}[] = [
  {
    icon: SparklesIcon,
    accent: "text-indigo-400",
    title: "Natural-language parsing",
    description: "Title, due date, priority and tags, extracted for you.",
  },
  {
    icon: TrendingUpIcon,
    accent: "text-violet-400",
    title: "AI prioritization",
    description: "Every open task scored 0–100 by urgency and context.",
  },
  {
    icon: ChatIcon,
    accent: "text-sky-400",
    title: "Conversational agent",
    description: "Create, complete or delete tasks just by chatting.",
  },
];

function Wordmark() {
  return (
    <div className="flex items-center gap-2.5">
      <span className="flex h-8 w-8 items-center justify-center rounded-lg border border-indigo-500/30 bg-indigo-500/10">
        <StarIcon className="h-4 w-4 text-indigo-400" />
      </span>
      <span className="text-[15px] font-semibold tracking-tight text-white">
        AI Todo
      </span>
    </div>
  );
}

export function AuthSplitLayout({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle: string;
  children: ReactNode;
}) {
  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden p-4 lg:p-8">
      <div
        aria-hidden
        className="pointer-events-none absolute left-1/2 top-1/2 h-[420px] w-[720px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-indigo-600/10 blur-[120px]"
      />

      <div className="relative w-full max-w-4xl animate-fade-in overflow-hidden rounded-2xl border border-slate-800 bg-slate-900/30">
        <div className="grid lg:grid-cols-2">
          {/* Brand / feature panel */}
          <div className="hidden flex-col justify-between gap-12 border-r border-slate-800 bg-gradient-to-b from-slate-900/50 to-transparent p-10 lg:flex">
            <Wordmark />

            <div>
              <h2 className="text-[26px] font-semibold leading-[1.25] tracking-tight text-white [text-wrap:balance]">
                Manage your day by{" "}
                <span className="text-indigo-300">just talking to it.</span>
              </h2>
              <p className="mt-3 text-sm leading-relaxed text-slate-400">
                Describe what you need in plain language — the structuring,
                scheduling and ranking is handled for you.
              </p>
            </div>

            <ul className="divide-y divide-slate-800 border-y border-slate-800">
              {FEATURES.map(({ icon: Icon, accent, title: feature, description }) => (
                <li key={feature} className="flex items-start gap-3 py-4">
                  <Icon className={`mt-0.5 h-4 w-4 shrink-0 ${accent}`} />
                  <div>
                    <p className="text-[13px] font-medium text-slate-200">
                      {feature}
                    </p>
                    <p className="mt-0.5 text-[12.5px] leading-relaxed text-slate-500">
                      {description}
                    </p>
                  </div>
                </li>
              ))}
            </ul>

            <p className="flex items-center gap-2 text-[12px] text-slate-600">
              <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-500/80" />
              Passwords are bcrypt-hashed. Only you can see your tasks.
            </p>
          </div>

          {/* Form panel */}
          <div className="flex items-center justify-center p-8 sm:p-10 lg:p-12">
            <div className="w-full max-w-sm">
              <div className="mb-8 lg:hidden">
                <Wordmark />
              </div>

              <div className="mb-7">
                <h1 className="text-xl font-semibold tracking-tight text-white">
                  {title}
                </h1>
                <p className="mt-1.5 text-sm text-slate-400">{subtitle}</p>
              </div>

              {children}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
