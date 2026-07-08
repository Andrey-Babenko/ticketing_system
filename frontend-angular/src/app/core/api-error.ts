import { HttpErrorResponse } from '@angular/common/http';

export class ApiError {
  constructor(
    readonly status: number,
    readonly code: string,
    readonly message: string,
    readonly field?: string,
  ) {}
}

export function toApiError(e: unknown): ApiError {
  if (e instanceof HttpErrorResponse) {
    const body = e.error as { error?: { code?: string; message?: string; field?: string } } | null;
    const err = body?.error;
    if (err?.code) {
      return new ApiError(e.status, err.code, err.message ?? 'Request failed', err.field);
    }
    return new ApiError(e.status, 'INTERNAL', 'Request failed');
  }
  return new ApiError(0, 'INTERNAL', 'Request failed');
}
