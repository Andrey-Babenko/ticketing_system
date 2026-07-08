import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { Router } from '@angular/router';
import { catchError, throwError } from 'rxjs';

// Auth screens are exempt from the 401 redirect — they're where a signed-out user
// legitimately ends up, and the redirect would otherwise loop (React client.ts parity).
const PUBLIC_PATHS = ['/login', '/signup', '/verify'];

export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const router = inject(Router);
  return next(req).pipe(
    catchError((err: unknown) => {
      const body = err instanceof HttpErrorResponse ? (err.error as { error?: { code?: string } } | null) : null;
      if (
        err instanceof HttpErrorResponse &&
        err.status === 401 &&
        body?.error?.code === 'UNAUTHENTICATED' &&
        !req.url.endsWith('/auth/me') && // the guards handle this 401 declaratively
        !PUBLIC_PATHS.some((p) => location.pathname.startsWith(p))
      ) {
        router.navigateByUrl('/login');
      }
      return throwError(() => err);
    }),
  );
};
