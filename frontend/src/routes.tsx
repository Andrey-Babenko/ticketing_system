import { createBrowserRouter, Navigate } from "react-router";
import Layout from "./components/Layout";
import Login from "./pages/Login";
import Signup from "./pages/Signup";
import Verify from "./pages/Verify";
import Board from "./pages/Board";
import Teams from "./pages/Teams";
import Epics from "./pages/Epics";
import TicketNew from "./pages/TicketNew";
import TicketDetail from "./pages/TicketDetail";

// Auth screens render outside Layout — no Board/Teams/Epics tabs on wireframe 2.
export const router = createBrowserRouter([
  { path: "/login", element: <Login /> },
  { path: "/signup", element: <Signup /> },
  { path: "/verify", element: <Verify /> },
  {
    element: <Layout />,
    children: [
      { index: true, element: <Navigate to="/board" replace /> },
      { path: "/board", element: <Board /> },
      { path: "/board/:teamId", element: <Board /> },
      { path: "/teams", element: <Teams /> },
      { path: "/epics", element: <Epics /> },
      { path: "/tickets/new", element: <TicketNew /> },
      { path: "/tickets/:id", element: <TicketDetail /> },
    ],
  },
]);
