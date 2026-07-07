import { useState } from "react";
import { Link, useNavigate } from "react-router";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { login, meKey } from "../api/auth";
import { ApiError } from "../api/client";
import { AuthCard, Field, Button } from "../components/ui";
import ResendVerification from "../components/ResendVerification";

export default function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const m = useMutation({
    mutationFn: login,
    onSuccess: (user) => {
      queryClient.setQueryData(meKey, user); // prime the guard — no second round-trip
      navigate("/board");
    },
  });

  const apiError = m.error instanceof ApiError ? m.error : undefined;
  // ADR-3: the resend prompt appears ONLY on this exact code, never preemptively.
  const notVerified = apiError?.code === "EMAIL_NOT_VERIFIED";
  const fieldError = (name: string) =>
    apiError?.field === name ? apiError.message : undefined;

  return (
    <AuthCard title="Log in">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          m.mutate({ email, password }); // resets error state → hides the resend prompt
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
          error={fieldError("password")}
        />
        {apiError && !apiError.field && !notVerified && (
          <p className="mb-3 text-sm text-red-600">{apiError.message}</p>
        )}
        <Button pending={m.isPending} pendingLabel="Logging in…">
          Log in
        </Button>
      </form>

      {notVerified && (
        <div className="mt-4 rounded border border-amber-300 bg-amber-50 p-3">
          <p className="mb-2 text-sm text-amber-900">Account not verified?</p>
          <ResendVerification email={email} />
        </div>
      )}

      <p className="mt-4 text-sm text-gray-600">
        New here?{" "}
        <Link to="/signup" className="font-medium text-blue-700 hover:underline">
          Create an account
        </Link>
      </p>
    </AuthCard>
  );
}
