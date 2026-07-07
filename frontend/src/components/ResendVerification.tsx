import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { resendVerification } from "../api/auth";

// Shared by the login screen and the verify screen's expired/invalid variants (ADR-6):
// with an `email` prop it renders button-only (login posts the typed email);
// without one it renders its own email input (verify screen).
export default function ResendVerification({ email }: { email?: string }) {
  const [value, setValue] = useState(email ?? "");
  const m = useMutation({ mutationFn: resendVerification });

  if (m.isSuccess) {
    return <p className="text-sm text-green-700">{m.data.message}</p>;
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (value) m.mutate(value);
      }}
      className="flex flex-col gap-2"
    >
      {email === undefined && (
        <input
          type="email"
          required
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="you@example.com"
          className="w-full rounded border border-gray-300 px-3 py-2 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
        />
      )}
      <button
        type="submit"
        disabled={m.isPending}
        className="rounded border border-blue-600 px-3 py-1.5 text-sm font-medium text-blue-700 hover:bg-blue-50 disabled:opacity-60"
      >
        {m.isPending ? "Sending…" : "Resend email"}
      </button>
      {m.isError && <p className="text-xs text-red-600">Could not send — try again.</p>}
    </form>
  );
}
