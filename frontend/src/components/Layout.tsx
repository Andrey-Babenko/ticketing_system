import { NavLink, Outlet, useNavigate } from "react-router";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { logout, useMe } from "../api/auth";

function UserMenu() {
  const { data: user } = useMe(); // RequireAuth guarantees data here
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const m = useMutation({
    mutationFn: logout,
    onSettled: () => {
      // Even a 401 (already-dead session) should land on /login. Navigate first so
      // Layout unmounts, then clear so no stale user ever flashes for the next login.
      navigate("/login", { replace: true });
      queryClient.clear();
    },
  });

  if (!user) return null;

  return (
    <details className="relative ml-auto">
      <summary className="cursor-pointer list-none rounded px-2 py-1 text-sm text-gray-200 hover:bg-gray-700">
        {user.email} ▾
      </summary>
      <div className="absolute right-0 z-10 mt-1 w-40 rounded border border-gray-200 bg-white shadow-lg">
        <button
          type="button"
          onClick={() => m.mutate()}
          disabled={m.isPending}
          className="block w-full px-3 py-2 text-left text-sm text-gray-800 hover:bg-gray-100 disabled:opacity-60"
        >
          {m.isPending ? "Logging out…" : "Log out"}
        </button>
      </div>
    </details>
  );
}

const tabClass = ({ isActive }: { isActive: boolean }) =>
  `rounded px-3 py-1.5 text-sm font-medium ${
    isActive ? "bg-gray-700 text-white" : "text-gray-300 hover:bg-gray-700 hover:text-white"
  }`;

export default function Layout() {
  return (
    <>
      <header className="flex items-center gap-6 bg-gray-800 px-4 py-2">
        <strong className="text-sm tracking-wide text-white">TICKET TRACKER</strong>
        <nav className="flex gap-1">
          <NavLink to="/board" className={tabClass}>
            Board
          </NavLink>
          <NavLink to="/teams" className={tabClass}>
            Teams
          </NavLink>
          <NavLink to="/epics" className={tabClass}>
            Epics
          </NavLink>
        </nav>
        <UserMenu />
      </header>
      <main className="min-h-0 flex-1 overflow-y-auto p-4">
        <Outlet />
      </main>
    </>
  );
}
