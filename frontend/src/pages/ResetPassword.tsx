import { useState } from "react";
import { useSearchParams, Link } from "react-router";
import { useMutation } from "@tanstack/react-query";
import { resetPassword } from "../api/auth";
import { ApiError } from "../api/client";
import { AuthCard, Field, Button } from "../components/ui";

function TokenErrorPanel({ expired }: { expired?: boolean }) {
  return (
    <AuthCard title="Reset link invalid">
      <p className="mb-4 text-sm text-red-700">
        {expired ? "This reset link has expired." : "This reset link is invalid."}
      </p>
      <p className="text-sm text-gray-700">
        <Link to="/forgot-password" className="font-medium text-blue-700 hover:underline">
          Request a new link
        </Link>
      </p>
    </AuthCard>
  );
}

export default function ResetPassword() {
  const [params] = useSearchParams();
  const token = params.get("token");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [confirmError, setConfirmError] = useState<string>();

  const m = useMutation({
    mutationFn: (p: string) => resetPassword(token!, p),
  });

  if (token === null) return <TokenErrorPanel />;

  if (m.isSuccess) {
    return (
      <AuthCard title="Password reset">
        <p className="mb-4 text-sm text-gray-700">{m.data.message}</p>
        <Link
          to="/login"
          className="block w-full rounded bg-blue-600 px-4 py-2 text-center text-sm font-medium text-white hover:bg-blue-700"
        >
          Continue to login
        </Link>
      </AuthCard>
    );
  }

  const apiError = m.error instanceof ApiError ? m.error : undefined;
  // A dead token (expired or already used) gets its own panel — no form to retry with,
  // since neither more form input nor a resubmit can fix it (ADR-6-style split, but
  // pointed at /forgot-password rather than an inline resend: unlike verification,
  // requesting a new reset link needs the email, which this screen never collects).
  if (apiError && (apiError.code === "TOKEN_EXPIRED" || apiError.code === "TOKEN_INVALID")) {
    return <TokenErrorPanel expired={apiError.code === "TOKEN_EXPIRED"} />;
  }

  return (
    <AuthCard title="Reset password">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (confirm !== password) {
            setConfirmError("Passwords do not match");
            return; // client-side only — confirm is never sent
          }
          setConfirmError(undefined);
          m.mutate(password);
        }}
        noValidate
      >
        <Field
          label="New password"
          type="password"
          required
          hint="Minimum 8 characters"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          error={apiError?.field === "password" ? apiError.message : undefined}
        />
        <Field
          label="Confirm password"
          type="password"
          required
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          error={confirmError}
        />
        {apiError && !apiError.field && (
          <p className="mb-3 text-sm text-red-600">{apiError.message}</p>
        )}
        <Button fullWidth pending={m.isPending} pendingLabel="Resetting…">
          Reset password
        </Button>
      </form>
    </AuthCard>
  );
}
