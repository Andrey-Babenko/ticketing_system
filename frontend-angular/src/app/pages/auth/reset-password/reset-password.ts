import { Component, inject, signal } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { AuthCard } from '../../../components/auth-card/auth-card';
import { AuthService } from '../../../api/services/auth.service';
import { ApiError, toApiError } from '../../../core/api-error';

@Component({
  selector: 'app-reset-password',
  imports: [RouterLink, MatFormFieldModule, MatInputModule, MatButtonModule, AuthCard],
  templateUrl: './reset-password.html',
  styleUrl: './reset-password.scss',
})
export class ResetPassword {
  private readonly api = inject(AuthService);
  private readonly route = inject(ActivatedRoute);

  private readonly token = this.route.snapshot.queryParamMap.get('token');

  readonly password = signal('');
  readonly confirm = signal('');
  readonly confirmError = signal<string | undefined>(undefined);

  readonly pending = signal(false);
  readonly apiError = signal<ApiError | null>(null);
  readonly successMessage = signal<string | null>(null);
  readonly dead = signal(this.token === null);
  readonly expired = signal(false);

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
      const res = await this.api.resetPassword({ body: { token: this.token!, password: this.password() } });
      this.successMessage.set(res.message);
    } catch (e) {
      const err = toApiError(e);
      // A dead token gets its own panel — no form to retry with (React ResetPassword.tsx parity).
      if (err.code === 'TOKEN_EXPIRED' || err.code === 'TOKEN_INVALID') {
        this.expired.set(err.code === 'TOKEN_EXPIRED');
        this.dead.set(true);
      } else {
        this.apiError.set(err);
      }
    } finally {
      this.pending.set(false);
    }
  }
}
