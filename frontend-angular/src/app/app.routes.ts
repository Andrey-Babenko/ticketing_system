import { Routes } from '@angular/router';
import { Login } from './pages/auth/login/login';
import { Signup } from './pages/auth/signup/signup';
import { Verify } from './pages/auth/verify/verify';
import { ForgotPassword } from './pages/auth/forgot-password/forgot-password';
import { ResetPassword } from './pages/auth/reset-password/reset-password';
import { Layout } from './layout/layout';
import { Teams } from './pages/teams/teams';
import { Epics } from './pages/epics/epics';
import { Board } from './pages/board/board';
import { TicketDetail } from './pages/ticket-detail/ticket-detail';
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
      { path: 'board', component: Board },
      { path: 'board/:teamId', component: Board },
      { path: 'teams', component: Teams },
      { path: 'epics', component: Epics },
      { path: 'tickets/new', component: TicketDetail, data: { create: true } },
      { path: 'tickets/:id', component: TicketDetail },
    ],
  },
];
