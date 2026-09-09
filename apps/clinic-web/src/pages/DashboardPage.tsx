/**
 * Pagina inicial (dashboard) com atalhos e resumo. Nesta fundacao, apresenta os
 * modulos disponiveis; indicadores reais serao ligados em iteracoes futuras.
 */

import { Link } from "react-router-dom";

import { useAuth } from "../auth/auth-context.js";

export function DashboardPage(): JSX.Element {
  const { session } = useAuth();
  return (
    <section>
      <h2>Início</h2>
      <p>Bem-vindo(a). Você está conectado à clínica {session?.tenantId}.</p>
      <div style={{ display: "flex", gap: 16, marginTop: 16 }}>
        <Link to="/pacientes">Gerenciar pacientes</Link>
        <Link to="/agenda">Ver agenda</Link>
      </div>
    </section>
  );
}
