import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { SessionService } from './session.service';

export const requireAuth: CanActivateFn = async () => {
  const session = inject(SessionService);
  const router = inject(Router);
  const user = await session.load();
  return user ? true : router.parseUrl('/login');
};

export const redirectIfAuthed: CanActivateFn = async () => {
  const session = inject(SessionService);
  const router = inject(Router);
  const user = await session.load();
  return user ? router.parseUrl('/board') : true;
};
