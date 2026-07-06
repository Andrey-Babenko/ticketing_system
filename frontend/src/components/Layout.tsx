import { NavLink, Outlet } from "react-router";

export default function Layout() {
  return (
    <>
      <header>
        <strong>TICKET TRACKER</strong>
        <nav>
          <NavLink to="/board">Board</NavLink>
          <NavLink to="/teams">Teams</NavLink>
          <NavLink to="/epics">Epics</NavLink>
        </nav>
        {/* placeholder — real email + dropdown (incl. Log out) lands with auth UI in Slice 2 */}
        <span>account ▾</span>
      </header>
      <main>
        <Outlet />
      </main>
    </>
  );
}
