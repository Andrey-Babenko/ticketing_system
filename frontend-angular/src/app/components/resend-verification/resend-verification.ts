import { Component, inject, input, signal } from '@angular/core';
import { AuthService } from '../../api/services/auth.service';

// Shared by the login screen and the verify screen's expired/invalid variants (ADR-6):
// with an `email` input it renders button-only (login posts the given email);
// without one it renders its own email input (verify screen).
@Component({
  selector: 'app-resend-verification',
  imports: [],
  templateUrl: './resend-verification.html',
  styleUrl: './resend-verification.scss',
})
export class ResendVerification {
  private readonly api = inject(AuthService);

  readonly email = input<string>();

  readonly typedEmail = signal('');
  readonly pending = signal(false);
  readonly sent = signal(false);
  readonly message = signal('');
  readonly failed = signal(false);

  onTypedEmailInput(value: string) {
    this.typedEmail.set(value);
  }

  async submit() {
    const value = this.email() ?? this.typedEmail();
    if (!value) return;
    this.pending.set(true);
    this.failed.set(false);
    try {
      const res = await this.api.resendVerification({ body: { email: value } });
      this.message.set(res.message);
      this.sent.set(true);
    } catch {
      this.failed.set(true);
    } finally {
      this.pending.set(false);
    }
  }
}
