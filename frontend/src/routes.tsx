import { createBrowserRouter, Navigate } from "react-router";
import Layout from "./components/Layout";
import { RequireAuth, RedirectIfAuthed } from "./lib/authGuard";
import Login from "./pages/Login";
import Signup from "./pages/Signup";
import Verify from "./pages/Verify";
import ForgotPassword from "./pages/ForgotPassword";
import ResetPassword from "./pages/ResetPassword";
import Board from "./pages/Board";
import Teams from "./pages/Teams";
import Epics from "./pages/Epics";
import TicketDetail from "./pages/TicketDetail";

// Auth screens render outside Layout — no Board/Teams/Epics tabs on wireframe 2.
// /verify is deliberately unguarded: the screen is a function of the token, not the
// session — a logged-in user re-clicking a link must still see the result.
export const router = createBrowserRouter([
  { path: "/login", element: <RedirectIfAuthed><Login /></RedirectIfAuthed> },
  { path: "/signup", element: <RedirectIfAuthed><Signup /></RedirectIfAuthed> },
  { path: "/verify", element: <Verify /> },
  { path: "/forgot-password", element: <RedirectIfAuthed><ForgotPassword /></RedirectIfAuthed> },
  // Unguarded like /verify — the screen is a function of the token, not the session.
  { path: "/reset-password", element: <ResetPassword /> },
  {
    element: <RequireAuth><Layout /></RequireAuth>,
    children: [
      { index: true, element: <Navigate to="/board" replace /> },
      { path: "/board", element: <Board /> },
      { path: "/board/:teamId", element: <Board /> },
      { path: "/teams", element: <Teams /> },
      { path: "/epics", element: <Epics /> },
      { path: "/tickets/new", element: <TicketDetail create /> },
      { path: "/tickets/:id", element: <TicketDetail /> },
    ],
  },
]);
