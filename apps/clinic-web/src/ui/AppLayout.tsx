/**
 * Shell da aplicacao autenticada: barra lateral de navegacao e area de conteudo.
 * A navegacao agrupa os modulos por area (clinico, financeiro, crescimento,
 * administracao).
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

          <div className="nav-group">Clínico</div>
          <NavLink to="/pacientes">Pacientes</NavLink>
          <NavLink to="/agenda">Agenda</NavLink>
          <NavLink to="/tratamentos">Tratamentos</NavLink>

          <div className="nav-group">Financeiro</div>
          <NavLink to="/financeiro">Financeiro</NavLink>

          <div className="nav-group">Crescimento</div>
          <NavLink to="/crm">CRM</NavLink>
          <NavLink to="/recepcao-ia">Recepção IA</NavLink>

          <div className="nav-group">Administração</div>
          <NavLink to="/usuarios">Usuários</NavLink>
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
