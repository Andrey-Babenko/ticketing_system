import { useEffect, useRef } from "react";

interface ToastProps {
  message: string;
  onDismiss: () => void;
}

// Minimal hand-rolled toast (interview decision, S6.2): transient drag-failure feedback
// (§8) — a lingering banner doesn't fit a transient error, and a full library is
// overkill for one call site.
export default function Toast({ message, onDismiss }: ToastProps) {
  // Callers (Board.tsx) pass a fresh `() => setToast(null)` closure every render;
  // depending on it directly would restart the timer on every unrelated parent
  // re-render (review finding). Read the latest via a ref instead, so the effect only
  // ever depends on `message`.
  const onDismissRef = useRef(onDismiss);
  onDismissRef.current = onDismiss;

  useEffect(() => {
    const timer = setTimeout(() => onDismissRef.current(), 5000);
    return () => clearTimeout(timer);
  }, [message]);

  return (
    <div
      role="alert"
      className="fixed right-4 bottom-4 z-30 max-w-sm rounded bg-gray-900 px-4 py-3 text-sm text-white shadow-lg"
    >
      {message}
    </div>
  );
}
