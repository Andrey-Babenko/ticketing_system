import { useEffect } from "react";

interface ToastProps {
  message: string;
  onDismiss: () => void;
}

// Minimal hand-rolled toast (interview decision, S6.2): transient drag-failure feedback
// (§8) — a lingering banner doesn't fit a transient error, and a full library is
// overkill for one call site.
export default function Toast({ message, onDismiss }: ToastProps) {
  useEffect(() => {
    const timer = setTimeout(onDismiss, 5000);
    return () => clearTimeout(timer);
  }, [message, onDismiss]);

  return (
    <div
      role="alert"
      className="fixed right-4 bottom-4 z-30 max-w-sm rounded bg-gray-900 px-4 py-3 text-sm text-white shadow-lg"
    >
      {message}
    </div>
  );
}
