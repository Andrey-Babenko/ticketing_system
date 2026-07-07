import type { ReactNode } from "react";
import { useEffect, useRef } from "react";
import { Button } from "./ui";

interface ConfirmDialogProps {
  open: boolean;
  title: string;
  children: ReactNode;
  confirmLabel?: string;
  pendingLabel?: string;
  pending?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

// Reusable confirmation dialog — team delete now, ticket delete in Slice 5 (§6).
export default function ConfirmDialog({
  open,
  title,
  children,
  confirmLabel = "Delete",
  pendingLabel,
  pending,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const panelRef = useRef<HTMLDivElement>(null);

  // Move focus into the dialog on open (keyboard/screen-reader users never reach
  // an aria-modal dialog otherwise) and restore it to the trigger on close.
  useEffect(() => {
    if (!open) return;
    const previouslyFocused = document.activeElement as HTMLElement | null;
    panelRef.current?.querySelector("button")?.focus();
    return () => previouslyFocused?.focus();
  }, [open]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-20 flex items-center justify-center bg-black/40 p-4"
      onClick={pending ? undefined : onCancel}
      onKeyDown={(e) => {
        if (e.key === "Escape" && !pending) onCancel();
      }}
    >
      <div
        ref={panelRef}
        role="alertdialog"
        aria-modal="true"
        aria-label={title}
        className="w-full max-w-sm rounded-lg bg-white p-5 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="mb-2 text-base font-semibold text-gray-900">{title}</h2>
        <div className="mb-4 text-sm text-gray-700">{children}</div>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" pending={pending} pendingLabel="Cancel" onClick={onCancel}>
            Cancel
          </Button>
          <Button
            type="button"
            variant="danger"
            pending={pending}
            pendingLabel={pendingLabel ?? `${confirmLabel}…`}
            onClick={onConfirm}
          >
            {confirmLabel}
          </Button>
        </div>
      </div>
    </div>
  );
}
