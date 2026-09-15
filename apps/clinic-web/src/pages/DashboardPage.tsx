/**
 * Pagina inicial com indicadores agregados dos dominios de agenda, financeiro
 * e CRM. Cada leitura continua isolada pelo tenant presente no access token.
 */

import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";

import type {
  CrmDashboard,
  FinanceDashboard,
  SchedulingDashboard,
} from "../api/types.js";
import { useServices } from "../api/use-services.js";
import { useAuth } from "../auth/auth-context.js";
import { formatCents } from "../lib/money.js";
import { EmptyState, ErrorBanner, PageHeader } from "../ui/components.js";

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

function formatPercent(value: number | null): string {
  if (value === null) return "sem dados";
  return new Intl.NumberFormat("pt-BR", {
    style: "percent",
    maximumFractionDigits: 1,
  }).format(value);
}

export function DashboardPage(): JSX.Element {
  const { session } = useAuth();
  const { scheduling, finance, crm } = useServices();
  const [schedulingData, setSchedulingData] = useState<SchedulingDashboard | null>(null);
  const [financeData, setFinanceData] = useState<FinanceDashboard | null>(null);
  const [crmData, setCrmData] = useState<CrmDashboard | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (): Promise<void> => {
    setLoading(true);
    setError(null);

    const from = new Date();
    from.setHours(0, 0, 0, 0);
    const to = new Date(from);
    to.setDate(to.getDate() + 7);

    const results = await Promise.allSettled([
      scheduling.dashboard(from, to),
      finance.dashboard(),
      crm.dashboard(),
    ] as const);
    const [scheduleResult, financeResult, crmResult] = results;

    setSchedulingData(
      scheduleResult.status === "fulfilled" ? scheduleResult.value : null,
    );
    setFinanceData(financeResult.status === "fulfilled" ? financeResult.value : null);
    setCrmData(crmResult.status === "fulfilled" ? crmResult.value : null);

    const failures = results.filter((result) => result.status === "rejected").length;
    if (failures === results.length) {
      setError("Não foi possível carregar os indicadores.");
    } else if (failures > 0) {
      setError("Alguns indicadores não estão disponíveis para o seu perfil.");
    }
    setLoading(false);
  }, [crm, finance, scheduling]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <section>
      <PageHeader
        title="Início"
        subtitle={`Conectado à clínica ${session?.tenantId ?? ""}.`}
        actions={
          <button type="button" className="secondary" onClick={() => void load()}>
            Atualizar indicadores
          </button>
        }
      />

      <ErrorBanner message={error} />

      <div className="dashboard-section" aria-busy={loading}>
        <h3>Resumo operacional</h3>
        {loading ? <EmptyState message="Carregando indicadores..." /> : null}
        {!loading && !schedulingData && !financeData && !crmData ? (
          <EmptyState message="Nenhum indicador disponível." />
        ) : null}
        <div className="grid-cards">
          {schedulingData ? (
            <article className="card metric-card">
              <span className="metric-label">Agenda · próximos 7 dias</span>
              <strong className="metric-value">{schedulingData.total}</strong>
              <span className="muted">
                Taxa de faltas: {formatPercent(schedulingData.noShowRate)}
              </span>
            </article>
          ) : null}
          {financeData ? (
            <article className="card metric-card">
              <span className="metric-label">Saldo a receber</span>
              <strong className="metric-value">
                {formatCents(financeData.outstandingCents)}
              </strong>
              <span className="muted">
                Recebido: {formatCents(financeData.receivedCents)}
              </span>
            </article>
          ) : null}
          {crmData ? (
            <article className="card metric-card">
              <span className="metric-label">Leads no funil</span>
              <strong className="metric-value">{crmData.totalLeads}</strong>
              <span className="muted">
                Conversão: {formatPercent(crmData.conversionRate)}
              </span>
            </article>
          ) : null}
        </div>
      </div>

      <h3 className="shortcut-heading">Módulos</h3>
      <div className="grid-cards">
        {SHORTCUTS.map((shortcut) => (
          <Link
            key={shortcut.to}
            to={shortcut.to}
            className="card"
            style={{ textDecoration: "none" }}
          >
            <h3 style={{ marginTop: 0 }}>{shortcut.title}</h3>
            <p className="muted">{shortcut.description}</p>
          </Link>
        ))}
      </div>
    </section>
  );
}
