import { Routes } from '@angular/router';
import { LoginComponent } from './pages/auth/login.component';
import { SignupComponent } from './pages/auth/signup.component';
import { VerifyComponent } from './pages/auth/verify.component';
import { ForgotPasswordComponent } from './pages/auth/forgot-password.component';
import { ResetPasswordComponent } from './pages/auth/reset-password.component';
import { TeamsComponent } from './pages/teams.component';
import { EpicsComponent } from './pages/epics.component';
import { BoardComponent } from './pages/board.component';
import { TicketDetailComponent } from './pages/ticket-detail.component';

export const routes: Routes = [
  { path: 'login', component: LoginComponent },
  { path: 'signup', component: SignupComponent },
  { path: 'verify', component: VerifyComponent },
  { path: 'forgot-password', component: ForgotPasswordComponent },
  { path: 'reset-password', component: ResetPasswordComponent },
  { path: '', pathMatch: 'full', redirectTo: 'board' },
  { path: 'board', component: BoardComponent },
  { path: 'board/:teamId', component: BoardComponent },
  { path: 'teams', component: TeamsComponent },
  { path: 'epics', component: EpicsComponent },
  { path: 'tickets/new', component: TicketDetailComponent },
  { path: 'tickets/:id', component: TicketDetailComponent },
];
