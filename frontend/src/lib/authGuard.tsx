import type { ReactNode } from "react";
import { Navigate } from "react-router";
import { useMe } from "../api/auth";

// Blocks on pending — protected chrome must never flash for signed-out users (§11 loading state).
export function RequireAuth({ children }: { children: ReactNode }) {
  const { data, isPending } = useMe();
  if (isPending) return <p className="p-8 text-gray-500">Loading…</p>;
  if (!data) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

// Optimistic — the common case is signed-out, so render the form immediately;
// an authed visitor gets bounced when the me-probe resolves.
export function RedirectIfAuthed({ children }: { children: ReactNode }) {
  const { data } = useMe();
  if (data) return <Navigate to="/board" replace />;
  return <>{children}</>;
}
