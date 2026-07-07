import type { InputHTMLAttributes, ReactNode } from "react";
import { useId } from "react";

export function AuthCard({ title, children }: { title: string; children: ReactNode }) {
  return (
    <main className="flex flex-1 items-center justify-center bg-gray-50 p-4">
      <div className="w-full max-w-sm rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
        <h1 className="mb-4 text-xl font-semibold text-gray-900">{title}</h1>
        {children}
      </div>
    </main>
  );
}

interface FieldProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string;
  hint?: string;
  error?: string;
}

export function Field({ label, hint, error, ...inputProps }: FieldProps) {
  const id = useId();
  return (
    <div className="mb-3">
      <label htmlFor={id} className="mb-1 block text-sm font-medium text-gray-700">
        {label}
      </label>
      <input
        id={id}
        aria-invalid={error ? true : undefined}
        className={`w-full rounded border px-3 py-2 text-sm outline-none focus:ring-2 ${
          error
            ? "border-red-400 focus:ring-red-200"
            : "border-gray-300 focus:border-blue-400 focus:ring-blue-100"
        }`}
        {...inputProps}
      />
      {hint && !error && <p className="mt-1 text-xs text-gray-500">{hint}</p>}
      {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
    </div>
  );
}

interface ButtonProps {
  pending?: boolean;
  pendingLabel?: string;
  children: ReactNode;
  type?: "submit" | "button";
  onClick?: () => void;
}

export function Button({ pending, pendingLabel, children, type = "submit", onClick }: ButtonProps) {
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={pending}
      className="w-full rounded bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
    >
      {pending ? (pendingLabel ?? "Please wait…") : children}
    </button>
  );
}
