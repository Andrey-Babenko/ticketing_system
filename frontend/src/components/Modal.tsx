import type { KeyboardEvent, ReactNode, RefObject } from "react";
import { useEffect, useRef } from "react";

interface ModalProps {
  open: boolean;
  title: string;
  role?: "dialog" | "alertdialog";
  children: ReactNode;
  onClose: () => void;
  /** Element to focus first on open; defaults to the panel's first focusable button. */
  initialFocusRef?: RefObject<HTMLElement | null>;
  /** Suppress backdrop-click/Escape close while a mutation is in flight. */
  closeDisabled?: boolean;
}

const FOCUSABLE = "button, input, a[href], [tabindex]:not([tabindex='-1'])";

// Shared shell for ConfirmDialog and form modals: backdrop, focus-in on open,
// focus-restore on close, Escape-to-close, Tab trap. Extracted from ConfirmDialog
// (Slice 3 review fixed the first three — one implementation, not two to keep in
// sync; the Tab trap was still missing, closed here).
export default function Modal({
  open,
  title,
  role = "dialog",
  children,
  onClose,
  initialFocusRef,
  closeDisabled,
}: ModalProps) {
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const previouslyFocused = document.activeElement as HTMLElement | null;
    (initialFocusRef?.current ?? panelRef.current?.querySelector(FOCUSABLE))?.focus();
    return () => previouslyFocused?.focus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  if (!open) return null;

  function trapTab(e: KeyboardEvent) {
    if (e.key !== "Tab" || !panelRef.current) return;
    const focusables = [...panelRef.current.querySelectorAll<HTMLElement>(FOCUSABLE)];
    if (focusables.length === 0) return;
    const first = focusables[0];
    const last = focusables[focusables.length - 1];
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  }

  return (
    <div
      className="fixed inset-0 z-20 flex items-center justify-center bg-black/40 p-4"
      onClick={closeDisabled ? undefined : onClose}
      onKeyDown={(e) => {
        if (e.key === "Escape" && !closeDisabled) onClose();
        trapTab(e);
      }}
    >
      <div
        ref={panelRef}
        role={role}
        aria-modal="true"
        aria-label={title}
        className="w-full max-w-sm rounded-lg bg-white p-5 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="mb-2 text-base font-semibold text-gray-900">{title}</h2>
        {children}
      </div>
    </div>
  );
}
