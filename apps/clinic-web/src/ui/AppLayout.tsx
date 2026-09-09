/**
 * Shell da aplicacao autenticada: barra lateral de navegacao e area de conteudo.
 */

import { NavLink, Outlet } from "react-router-dom";

import { useAuth } from "../auth/auth-context.js";

export function AppLayout(): JSX.Element {
  const { session, logout } = useAuth();

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <h1>DentalPrime</h1>
        <nav>
          <NavLink to="/" end>
            Início
          </NavLink>
          <NavLink to="/pacientes">Pacientes</NavLink>
          <NavLink to="/agenda">Agenda</NavLink>
        </nav>
      </aside>
      <main className="content">
        <div className="topbar">
          <span>{session?.email}</span>
          <button type="button" onClick={() => void logout()}>
            Sair
          </button>
        </div>
        <Outlet />
      </main>
    </div>
  );
}
