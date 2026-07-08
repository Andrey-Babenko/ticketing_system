import { Component, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { AuthCard } from '../../../components/auth-card/auth-card';
import { SessionService } from '../../../core/session.service';
import { ApiError, toApiError } from '../../../core/api-error';
import { UserPublic } from '../../../api/models/user-public';

@Component({
  selector: 'app-signup',
  imports: [RouterLink, MatFormFieldModule, MatInputModule, MatButtonModule, AuthCard],
  templateUrl: './signup.html',
  styleUrl: './signup.scss',
})
export class Signup {
  private readonly session = inject(SessionService);

  readonly email = signal('');
  readonly password = signal('');
  readonly confirm = signal('');
  readonly confirmError = signal<string | undefined>(undefined);

  readonly pending = signal(false);
  readonly apiError = signal<ApiError | null>(null);
  readonly created = signal<UserPublic | null>(null);

  fieldError(name: string): string | undefined {
    const err = this.apiError();
    return err?.field === name ? err.message : undefined;
  }

  async submit() {
    if (this.confirm() !== this.password()) {
      this.confirmError.set('Passwords do not match'); // client-side only — confirm is never sent
      return;
    }
    this.confirmError.set(undefined);
    this.apiError.set(null);
    this.pending.set(true);
    try {
      const user = await this.session.signup(this.email(), this.password());
      this.created.set(user);
    } catch (e) {
      this.apiError.set(toApiError(e));
    } finally {
      this.pending.set(false);
    }
  }
}
