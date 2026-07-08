import { Component, inject, signal } from '@angular/core';
import { Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { SessionService } from '../core/session.service';

@Component({
  selector: 'app-layout',
  imports: [RouterLink, RouterLinkActive, RouterOutlet],
  templateUrl: './layout.html',
  styleUrl: './layout.scss',
})
export class Layout {
  private readonly session = inject(SessionService);
  private readonly router = inject(Router);

  readonly user = this.session.user;
  readonly loggingOut = signal(false);

  async logout() {
    this.loggingOut.set(true);
    await this.session.logout();
    this.loggingOut.set(false);
    this.router.navigateByUrl('/login');
  }
}
