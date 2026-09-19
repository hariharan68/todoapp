import { useState } from "react";
import { Link } from "react-router-dom";
import { AlertCircleIcon, EyeIcon, EyeOffIcon, LoaderIcon } from "../icons";

export function FormField({
  id,
  label,
  type,
  value,
  onChange,
  placeholder,
  hint,
  error,
  autoComplete,
}: {
  id: string;
  label: string;
  type: "email" | "password";
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  hint?: string;
  error?: string;
  autoComplete?: string;
}) {
  const [reveal, setReveal] = useState(false);
  const isPassword = type === "password";

  return (
    <div>
      <label
        htmlFor={id}
        className="mb-1.5 block text-[13px] font-medium text-slate-300"
      >
        {label}
      </label>
      <div className="relative">
        <input
          id={id}
          name={id}
          type={isPassword && reveal ? "text" : type}
          required
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          autoComplete={autoComplete}
          aria-invalid={error ? true : undefined}
          aria-describedby={error || hint ? `${id}-desc` : undefined}
          className={`w-full rounded-lg border bg-slate-950 py-2.5 pl-3.5 text-sm text-white placeholder-slate-600 outline-none transition duration-150 focus:ring-2 ${
            error
              ? "border-rose-500/50 focus:border-rose-500/70 focus:ring-rose-500/15"
              : "border-slate-800 focus:border-indigo-500/70 focus:ring-indigo-500/15"
          } ${isPassword ? "pr-10" : "pr-3.5"}`}
        />
        {isPassword && (
          <button
            type="button"
            onClick={() => setReveal((v) => !v)}
            aria-label={reveal ? "Hide password" : "Show password"}
            className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1.5 text-slate-500 transition-colors hover:text-slate-300 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-slate-600"
          >
            {reveal ? (
              <EyeOffIcon className="h-4 w-4" />
            ) : (
              <EyeIcon className="h-4 w-4" />
            )}
          </button>
        )}
      </div>
      {(error || hint) && (
        <p
          id={`${id}-desc`}
          className={`mt-1.5 text-[12px] ${error ? "text-rose-400" : "text-slate-600"}`}
        >
          {error ?? hint}
        </p>
      )}
    </div>
  );
}

export function FormError({ message }: { message: string }) {
  return (
    <p role="alert" className="flex items-start gap-2 text-[13px] text-rose-400">
      <AlertCircleIcon className="mt-0.5 h-3.5 w-3.5 shrink-0" />
      {message}
    </p>
  );
}

export function SubmitButton({
  loading,
  label,
  loadingLabel,
}: {
  loading: boolean;
  label: string;
  loadingLabel: string;
}) {
  return (
    <button
      type="submit"
      disabled={loading}
      className="flex w-full items-center justify-center gap-2 rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-medium text-white shadow-lg shadow-indigo-950/40 transition-colors duration-150 hover:bg-indigo-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950 disabled:cursor-not-allowed disabled:opacity-60"
    >
      {loading && <LoaderIcon className="h-4 w-4 animate-spin" />}
      {loading ? loadingLabel : label}
    </button>
  );
}

export function AuthSwitch({
  prompt,
  href,
  cta,
}: {
  prompt: string;
  href: string;
  cta: string;
}) {
  return (
    <p className="mt-6 text-center text-[13px] text-slate-500">
      {prompt}{" "}
      <Link
        to={href}
        className="font-medium text-indigo-400 underline-offset-4 transition-colors hover:text-indigo-300 hover:underline"
      >
        {cta}
      </Link>
    </p>
  );
}
