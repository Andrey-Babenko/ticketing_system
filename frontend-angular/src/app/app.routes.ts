import { Routes } from '@angular/router';
import { Login } from './pages/auth/login/login';
import { Signup } from './pages/auth/signup/signup';
import { Verify } from './pages/auth/verify/verify';
import { ForgotPassword } from './pages/auth/forgot-password/forgot-password';
import { ResetPassword } from './pages/auth/reset-password/reset-password';
import { Layout } from './layout/layout';
import { Teams } from './pages/teams/teams';
import { Epics } from './pages/epics/epics';
import { BoardComponent } from './pages/board.component';
import { TicketDetailComponent } from './pages/ticket-detail.component';
import { redirectIfAuthed, requireAuth } from './core/guards';

export const routes: Routes = [
  { path: 'login', component: Login, canActivate: [redirectIfAuthed] },
  { path: 'signup', component: Signup, canActivate: [redirectIfAuthed] },
  { path: 'verify', component: Verify },
  { path: 'forgot-password', component: ForgotPassword, canActivate: [redirectIfAuthed] },
  { path: 'reset-password', component: ResetPassword },
  {
    path: '',
    component: Layout,
    canActivate: [requireAuth],
    children: [
      { path: '', pathMatch: 'full', redirectTo: 'board' },
      { path: 'board', component: BoardComponent },
      { path: 'board/:teamId', component: BoardComponent },
      { path: 'teams', component: Teams },
      { path: 'epics', component: Epics },
      { path: 'tickets/new', component: TicketDetailComponent },
      { path: 'tickets/:id', component: TicketDetailComponent },
    ],
  },
];
