import { useState } from "react";
import { Link } from "react-router";
import { useMutation } from "@tanstack/react-query";
import { requestPasswordReset } from "../api/auth";
import { ApiError } from "../api/client";
import { AuthCard, Field, Button } from "../components/ui";

export default function ForgotPassword() {
  const [email, setEmail] = useState("");
  const m = useMutation({ mutationFn: requestPasswordReset });

  if (m.isSuccess) {
    // Generic message from the server (ADR-17 anti-enumeration) — nothing to add here.
    return (
      <AuthCard title="Check your email">
        <p className="text-sm text-gray-700">{m.data.message}</p>
        <p className="mt-4 text-sm text-gray-600">
          <Link to="/login" className="font-medium text-blue-700 hover:underline">
            Back to log in
          </Link>
        </p>
      </AuthCard>
    );
  }

  const apiError = m.error instanceof ApiError ? m.error : undefined;

  return (
    <AuthCard title="Forgot password">
      <p className="mb-4 text-sm text-gray-600">
        Enter your email and we'll send you a link to reset your password.
      </p>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          m.mutate(email);
        }}
        noValidate
      >
        <Field
          label="Email"
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          error={apiError?.field === "email" ? apiError.message : undefined}
        />
        {apiError && !apiError.field && (
          <p className="mb-3 text-sm text-red-600">{apiError.message}</p>
        )}
        <Button fullWidth pending={m.isPending} pendingLabel="Sending…">
          Send reset link
        </Button>
      </form>
      <p className="mt-4 text-sm text-gray-600">
        <Link to="/login" className="font-medium text-blue-700 hover:underline">
          Back to log in
        </Link>
      </p>
    </AuthCard>
  );
}
