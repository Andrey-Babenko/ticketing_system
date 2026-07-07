import { useQuery } from "@tanstack/react-query";
import { api } from "./client";

export interface UserPublic {
  id: number;
  email: string;
}

export interface Credentials {
  email: string;
  password: string;
}

export type VerifyStatus = "verified" | "already_verified";

export const signup = (c: Credentials) =>
  api<UserPublic>("/auth/signup", { method: "POST", body: JSON.stringify(c) });

export const login = (c: Credentials) =>
  api<UserPublic>("/auth/login", { method: "POST", body: JSON.stringify(c) });

export const logout = () => api<undefined>("/auth/logout", { method: "POST" }); // 204

export const me = () => api<UserPublic>("/auth/me");

export const verify = (token: string) =>
  api<{ status: VerifyStatus }>("/auth/verify", {
    method: "POST",
    body: JSON.stringify({ token }),
  });

export const resendVerification = (email: string) =>
  api<{ message: string }>("/auth/resend-verification", {
    method: "POST",
    body: JSON.stringify({ email }),
  });

export const meKey = ["me"] as const;

export function useMe() {
  return useQuery({
    queryKey: meKey,
    queryFn: me,
    retry: false, // resolve guards fast; login/logout manage this cache explicitly
    staleTime: 5 * 60_000,
  });
}
