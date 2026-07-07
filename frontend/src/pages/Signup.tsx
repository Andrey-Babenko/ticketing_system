import { useState } from "react";
import { Link } from "react-router";
import { useMutation } from "@tanstack/react-query";
import { signup } from "../api/auth";
import { ApiError } from "../api/client";
import { AuthCard, Field, Button } from "../components/ui";

export default function Signup() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [confirmError, setConfirmError] = useState<string>();

  const m = useMutation({ mutationFn: signup });

  if (m.isSuccess) {
    return (
      <AuthCard title="Check your email">
        <p className="text-sm text-gray-700">
          We sent a verification link to <strong>{m.data.email}</strong>. Click it within 24
          hours to activate your account.
        </p>
        <p className="mt-4 text-sm text-gray-600">
          Already verified?{" "}
          <Link to="/login" className="font-medium text-blue-700 hover:underline">
            Log in
          </Link>
        </p>
      </AuthCard>
    );
  }

  const apiError = m.error instanceof ApiError ? m.error : undefined;
  const fieldError = (name: string) =>
    apiError?.field === name ? apiError.message : undefined;

  return (
    <AuthCard title="Create account">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (confirm !== password) {
            setConfirmError("Passwords do not match");
            return; // client-side only — confirm is never sent (openapi Credentials)
          }
          setConfirmError(undefined);
          m.mutate({ email, password });
        }}
        noValidate
      >
        <Field
          label="Email"
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          error={fieldError("email")}
        />
        <Field
          label="Password"
          type="password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          hint="Minimum 8 characters"
          error={fieldError("password")}
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
        <Button fullWidth pending={m.isPending} pendingLabel="Creating account…">
          Sign up
        </Button>
      </form>
      <p className="mt-4 text-sm text-gray-600">
        Already registered?{" "}
        <Link to="/login" className="font-medium text-blue-700 hover:underline">
          Log in
        </Link>
      </p>
    </AuthCard>
  );
}
