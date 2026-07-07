import type { ComponentPropsWithRef, ReactNode } from "react";
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

// One source for the input/textarea/select shell styling — Field, TextArea, and Select
// must never drift apart on focus/error treatment (review finding). Exported (without
// `w-full`, which only suits a vertical form layout) so non-form consumers like
// FilterBar's horizontal toolbar can share the same border/focus treatment without
// inheriting Field's full-width assumption (Slice 6 review finding).
export const FIELD_SHELL = "rounded border px-3 py-2 text-sm outline-none focus:ring-2";
export const FIELD_SHELL_DEFAULT = "border-gray-300 focus:border-blue-400 focus:ring-blue-100";
export const FIELD_SHELL_ERROR = "border-red-400 focus:ring-red-200";

function fieldClass(error?: string, extra = ""): string {
  return `w-full ${FIELD_SHELL} ${error ? FIELD_SHELL_ERROR : FIELD_SHELL_DEFAULT} ${extra}`;
}

function FieldShell({
  id,
  label,
  hint,
  error,
  children,
}: {
  id: string;
  label: string;
  hint?: string;
  error?: string;
  children: ReactNode;
}) {
  return (
    <div className="mb-3">
      <label htmlFor={id} className="mb-1 block text-sm font-medium text-gray-700">
        {label}
      </label>
      {children}
      {hint && !error && <p className="mt-1 text-xs text-gray-500">{hint}</p>}
      {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
    </div>
  );
}

interface FieldProps extends ComponentPropsWithRef<"input"> {
  label: string;
  hint?: string;
  error?: string;
}

export function Field({ label, hint, error, ...inputProps }: FieldProps) {
  const id = useId();
  return (
    <FieldShell id={id} label={label} hint={hint} error={error}>
      <input
        id={id}
        aria-invalid={error ? true : undefined}
        className={fieldClass(error)}
        {...inputProps}
      />
    </FieldShell>
  );
}

interface TextAreaProps extends ComponentPropsWithRef<"textarea"> {
  label: string;
  hint?: string;
  error?: string;
}

export function TextArea({ label, hint, error, ...textareaProps }: TextAreaProps) {
  const id = useId();
  return (
    <FieldShell id={id} label={label} hint={hint} error={error}>
      <textarea
        id={id}
        aria-invalid={error ? true : undefined}
        className={fieldClass(error)}
        {...textareaProps}
      />
    </FieldShell>
  );
}

interface SelectProps extends ComponentPropsWithRef<"select"> {
  label: string;
  hint?: string;
  error?: string;
}

export function Select({ label, hint, error, children, ...selectProps }: SelectProps) {
  const id = useId();
  return (
    <FieldShell id={id} label={label} hint={hint} error={error}>
      <select
        id={id}
        aria-invalid={error ? true : undefined}
        className={fieldClass(error, "bg-white")}
        {...selectProps}
      >
        {children}
      </select>
    </FieldShell>
  );
}

const BUTTON_VARIANTS = {
  primary: "bg-blue-600 text-white hover:bg-blue-700",
  danger: "bg-red-600 text-white hover:bg-red-700",
  secondary: "border border-gray-300 text-gray-700 hover:bg-gray-100",
} as const;

interface ButtonProps extends ComponentPropsWithRef<"button"> {
  pending?: boolean;
  pendingLabel?: string;
  variant?: keyof typeof BUTTON_VARIANTS;
  fullWidth?: boolean;
}

// Native <button> defaults to type="submit"; callers pass type="button" where needed.
export function Button({
  pending,
  pendingLabel,
  children,
  variant = "primary",
  fullWidth,
  disabled,
  className: _ignored,
  ...buttonProps
}: ButtonProps) {
  return (
    <button
      disabled={pending || disabled}
      className={`rounded text-sm font-medium disabled:cursor-not-allowed disabled:opacity-60 ${
        fullWidth ? "w-full px-4 py-2" : "px-3 py-1.5"
      } ${BUTTON_VARIANTS[variant]}`}
      {...buttonProps}
    >
      {pending ? (pendingLabel ?? "Please wait…") : children}
    </button>
  );
}
