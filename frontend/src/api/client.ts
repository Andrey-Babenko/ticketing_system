export class ApiError extends Error {
  status: number;
  code: string;
  field?: string;

  constructor(status: number, code: string, message: string, field?: string) {
    super(message);
    this.status = status;
    this.code = code;
    this.field = field;
  }
}

// Auth screens are exempt from the 401 redirect — they're where a signed-out user
// legitimately ends up, and the redirect would otherwise loop.
const PUBLIC_PATHS = ["/login", "/signup", "/verify"];

export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`/api${path}`, {
    ...init,
    headers: init?.body ? { "Content-Type": "application/json", ...init.headers } : init?.headers,
  });

  if (res.status === 204) return undefined as T;

  const body = await res.json().catch(() => null);

  if (!res.ok) {
    const err = body?.error ?? { code: "INTERNAL", message: "Request failed" };
    if (
      res.status === 401 &&
      err.code === "UNAUTHENTICATED" &&
      !PUBLIC_PATHS.some((p) => window.location.pathname.startsWith(p))
    ) {
      window.location.assign("/login");
    }
    throw new ApiError(res.status, err.code, err.message, err.field);
  }

  return body as T;
}
