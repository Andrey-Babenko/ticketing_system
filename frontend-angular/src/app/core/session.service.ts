import { Injectable, inject, signal } from '@angular/core';
import { AuthService } from '../api/services/auth.service';
import { UserPublic } from '../api/models/user-public';

// Named SessionService (not AuthService) to avoid colliding with the generated
// api/services/auth.service.ts — this wraps it with the app's signal-based session state.
@Injectable({ providedIn: 'root' })
export class SessionService {
  private readonly api = inject(AuthService);

  // undefined = not yet resolved; null = resolved, no session; UserPublic = signed in.
  readonly user = signal<UserPublic | null | undefined>(undefined);
  private inflight: Promise<UserPublic | null> | null = null;

  async load(): Promise<UserPublic | null> {
    const current = this.user();
    if (current !== undefined) return current;
    if (this.inflight) return this.inflight;
    this.inflight = this.api
      .me()
      .then((u) => {
        this.user.set(u);
        return u;
      })
      .catch(() => {
        this.user.set(null);
        return null;
      })
      .finally(() => {
        this.inflight = null;
      });
    return this.inflight;
  }

  async login(email: string, password: string): Promise<UserPublic> {
    const user = await this.api.login({ body: { email, password } });
    this.user.set(user);
    return user;
  }

  async signup(email: string, password: string): Promise<UserPublic> {
    return this.api.signup({ body: { email, password } });
  }

  async logout(): Promise<void> {
    try {
      await this.api.logout();
    } finally {
      // Even a 401 (already-dead session) should still clear local state.
      this.user.set(null);
    }
  }
}
