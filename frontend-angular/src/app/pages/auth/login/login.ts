import { Component, computed, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { AuthCard } from '../../../components/auth-card/auth-card';
import { ResendVerification } from '../../../components/resend-verification/resend-verification';
import { SessionService } from '../../../core/session.service';
import { ApiError, toApiError } from '../../../core/api-error';

@Component({
  selector: 'app-login',
  imports: [RouterLink, MatFormFieldModule, MatInputModule, MatButtonModule, AuthCard, ResendVerification],
  templateUrl: './login.html',
  styleUrl: './login.scss',
})
export class Login {
  private readonly session = inject(SessionService);
  private readonly router = inject(Router);

  readonly email = signal('');
  readonly password = signal('');
  readonly pending = signal(false);
  readonly apiError = signal<ApiError | null>(null);

  readonly notVerified = computed(() => this.apiError()?.code === 'EMAIL_NOT_VERIFIED');

  fieldError(name: string): string | undefined {
    const err = this.apiError();
    return err?.field === name ? err.message : undefined;
  }

  async submit() {
    this.apiError.set(null); // resets error state → hides the resend prompt
    this.pending.set(true);
    try {
      await this.session.login(this.email(), this.password());
      this.router.navigateByUrl('/board');
    } catch (e) {
      this.apiError.set(toApiError(e));
    } finally {
      this.pending.set(false);
    }
  }
}
