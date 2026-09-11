/**
 * Shell autenticado do admin-portal: barra lateral de navegacao e conteudo.
 */

import { NavLink, Outlet } from "react-router-dom";

import { useAuth } from "../auth/auth-context.js";

export function AppLayout(): JSX.Element {
  const { session, logout } = useAuth();

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <h1>DentalPrime</h1>
        <p className="tagline">Administração da rede</p>
        <nav>
          <NavLink to="/" end>
            Visão geral
          </NavLink>
          <NavLink to="/unidades">Unidades</NavLink>
          <NavLink to="/usuarios">Usuários</NavLink>
          <NavLink to="/tenants">Tenants</NavLink>
        </nav>
      </aside>
      <main className="content">
        <div className="topbar">
          <span>{session?.email}</span>
          <button type="button" className="secondary" onClick={() => void logout()}>
            Sair
          </button>
        </div>
        <Outlet />
      </main>
    </div>
  );
}
