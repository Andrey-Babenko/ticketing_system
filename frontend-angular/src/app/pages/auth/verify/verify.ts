import { Component, OnInit, inject, signal } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { AuthService } from '../../../api/services/auth.service';
import { AuthCard } from '../../../components/auth-card/auth-card';
import { ResendVerification } from '../../../components/resend-verification/resend-verification';
import { toApiError } from '../../../core/api-error';

type VerifyState = 'pending' | 'verified' | 'already_verified' | 'expired' | 'invalid';

@Component({
  selector: 'app-verify',
  imports: [RouterLink, AuthCard, ResendVerification],
  templateUrl: './verify.html',
  styleUrl: './verify.scss',
})
export class Verify implements OnInit {
  private readonly api = inject(AuthService);
  private readonly route = inject(ActivatedRoute);

  readonly state = signal<VerifyState>('pending');

  ngOnInit() {
    const token = this.route.snapshot.queryParamMap.get('token');
    if (token === null) {
      this.state.set('invalid');
      return;
    }
    // Idempotent by design (ADR-9 — reuse returns already_verified); no retry needed.
    this.api
      .verifyEmail({ body: { token } })
      .then((res) => this.state.set(res.status))
      .catch((e) => {
        this.state.set(toApiError(e).code === 'TOKEN_EXPIRED' ? 'expired' : 'invalid');
      });
  }
}
