import { Component, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { AuthCard } from '../../../components/auth-card/auth-card';
import { AuthService } from '../../../api/services/auth.service';
import { ApiError, toApiError } from '../../../core/api-error';

@Component({
  selector: 'app-forgot-password',
  imports: [RouterLink, MatFormFieldModule, MatInputModule, MatButtonModule, AuthCard],
  templateUrl: './forgot-password.html',
  styleUrl: './forgot-password.scss',
})
export class ForgotPassword {
  private readonly api = inject(AuthService);

  readonly email = signal('');
  readonly pending = signal(false);
  readonly apiError = signal<ApiError | null>(null);
  readonly sentMessage = signal<string | null>(null);

  fieldError(name: string): string | undefined {
    const err = this.apiError();
    return err?.field === name ? err.message : undefined;
  }

  async submit() {
    this.apiError.set(null);
    this.pending.set(true);
    try {
      const res = await this.api.requestPasswordReset({ body: { email: this.email() } });
      this.sentMessage.set(res.message);
    } catch (e) {
      this.apiError.set(toApiError(e));
    } finally {
      this.pending.set(false);
    }
  }
}
