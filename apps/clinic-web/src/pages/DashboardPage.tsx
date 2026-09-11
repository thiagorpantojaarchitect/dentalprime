/**
 * Pagina inicial (dashboard) com atalhos para os modulos. Indicadores agregados
 * serao ligados quando houver endpoints de leitura consolidada.
 */

import { Link } from "react-router-dom";

import { useAuth } from "../auth/auth-context.js";
import { PageHeader } from "../ui/components.js";

const SHORTCUTS: ReadonlyArray<{
  readonly to: string;
  readonly title: string;
  readonly description: string;
}> = [
  { to: "/pacientes", title: "Pacientes", description: "Cadastro e prontuário clínico." },
  { to: "/agenda", title: "Agenda", description: "Agendamentos e confirmações." },
  {
    to: "/tratamentos",
    title: "Tratamentos",
    description: "Planos e aceitação de casos.",
  },
  {
    to: "/financeiro",
    title: "Financeiro",
    description: "Faturas, pagamentos e conciliação.",
  },
  { to: "/crm", title: "CRM", description: "Leads, campanhas e relacionamento." },
  {
    to: "/recepcao-ia",
    title: "Recepção IA",
    description: "Atendimento assistivo por IA.",
  },
  { to: "/usuarios", title: "Usuários", description: "Equipe e papéis (RBAC)." },
];

export function DashboardPage(): JSX.Element {
  const { session } = useAuth();
  return (
    <section>
      <PageHeader
        title="Início"
        subtitle={`Conectado à clínica ${session?.tenantId ?? ""}.`}
      />
      <div className="grid-cards">
        {SHORTCUTS.map((s) => (
          <Link key={s.to} to={s.to} className="card" style={{ textDecoration: "none" }}>
            <h3 style={{ marginTop: 0 }}>{s.title}</h3>
            <p className="muted">{s.description}</p>
          </Link>
        ))}
      </div>
    </section>
  );
}
