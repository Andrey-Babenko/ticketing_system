import type { ReactNode } from "react";
import { useSearchParams, Link } from "react-router";
import { useQuery } from "@tanstack/react-query";
import { verify } from "../api/auth";
import { ApiError } from "../api/client";
import { AuthCard } from "../components/ui";
import ResendVerification from "../components/ResendVerification";

function SuccessPanel({ already }: { already: boolean }) {
  return (
    <AuthCard title="Email verified">
      <p className="mb-4 text-sm text-gray-700">
        {already
          ? "This email address was already verified."
          : "Your email address has been verified."}{" "}
        You can log in now.
      </p>
      <Link
        to="/login"
        className="block w-full rounded bg-blue-600 px-4 py-2 text-center text-sm font-medium text-white hover:bg-blue-700"
      >
        Continue to login
      </Link>
    </AuthCard>
  );
}

function ErrorPanel({ kind }: { kind: "expired" | "invalid" }) {
  return (
    <AuthCard title="Verification failed">
      <p className="mb-4 text-sm text-red-700">
        {kind === "expired"
          ? "This verification link has expired."
          : "This verification link is invalid."}
      </p>
      <p className="mb-2 text-sm text-gray-700">Enter your email to receive a new link:</p>
      <ResendVerification />
      <p className="mt-4 text-sm text-gray-600">
        <Link to="/login" className="font-medium text-blue-700 hover:underline">
          Back to log in
        </Link>
      </p>
    </AuthCard>
  );
}

export default function Verify() {
  const [params] = useSearchParams();
  const token = params.get("token");

  // POST-from-useQuery is intentional: the endpoint is idempotent by design (ADR-9 —
  // re-use returns already_verified), and the shared queryKey dedupes StrictMode's
  // double-mount into one request. Result is final: never retry, never refetch.
  const q = useQuery({
    queryKey: ["verify", token],
    queryFn: () => verify(token!),
    enabled: token !== null,
    retry: false,
    staleTime: Infinity,
    gcTime: Infinity,
  });

  let content: ReactNode;
  if (token === null) {
    content = <ErrorPanel kind="invalid" />;
  } else if (q.isPending) {
    content = (
      <AuthCard title="Email verification">
        <p className="text-sm text-gray-600">Verifying…</p>
      </AuthCard>
    );
  } else if (q.isError) {
    const expired = q.error instanceof ApiError && q.error.code === "TOKEN_EXPIRED";
    content = <ErrorPanel kind={expired ? "expired" : "invalid"} />;
  } else {
    content = <SuccessPanel already={q.data.status === "already_verified"} />;
  }
  return content;
}
