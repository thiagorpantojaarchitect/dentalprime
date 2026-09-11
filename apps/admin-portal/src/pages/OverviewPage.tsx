/**
 * Visao geral da rede: dados do tenant atual e contadores de unidades e
 * usuarios. Consome identity-access (gestao de rede).
 */

import { useCallback, useEffect, useState } from "react";

import { ApiError } from "../api/client.js";
import type { Tenant } from "../api/types.js";
import { useServices } from "../api/use-services.js";
import { EmptyState, ErrorBanner, PageHeader, StatusBadge } from "../ui/components.js";

function networkError(err: unknown, fallback: string): string {
  if (err instanceof ApiError) {
    if (err.code === "FORBIDDEN") return "Você não tem permissão de administração.";
    if (err.code === "NOT_FOUND") return "Recurso não encontrado.";
    if (err.code === "UNAUTHENTICATED") return "Sessão expirada. Entre novamente.";
  }
  return fallback;
}

export function OverviewPage(): JSX.Element {
  const { network } = useServices();
  const [tenant, setTenant] = useState<Tenant | null>(null);
  const [unitCount, setUnitCount] = useState<number | null>(null);
  const [userCount, setUserCount] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (): Promise<void> => {
    setError(null);
    try {
      const [t, units, users] = await Promise.all([
        network.currentTenant(),
        network.listUnits(),
        network.listUsers(),
      ]);
      setTenant(t);
      setUnitCount(units.length);
      setUserCount(users.length);
    } catch (err) {
      setError(networkError(err, "Não foi possível carregar a visão geral."));
    }
  }, [network]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <section>
      <PageHeader
        title="Visão geral"
        subtitle="Resumo da rede administrada."
        actions={
          tenant ? (
            <StatusBadge
              status={tenant.active ? "ativo" : "inativo"}
              variant={tenant.active ? "success" : "danger"}
            />
          ) : undefined
        }
      />

      <ErrorBanner message={error} />

      {tenant ? (
        <div className="grid-cards">
          <div className="card">
            <h3 style={{ marginTop: 0 }}>Tenant</h3>
            <p className="muted">{tenant.name}</p>
          </div>
          <div className="card">
            <h3 style={{ marginTop: 0 }}>Unidades</h3>
            <p className="muted">{unitCount ?? "-"}</p>
          </div>
          <div className="card">
            <h3 style={{ marginTop: 0 }}>Usuários</h3>
            <p className="muted">{userCount ?? "-"}</p>
          </div>
        </div>
      ) : error ? null : (
        <EmptyState message="Carregando..." />
      )}
    </section>
  );
}
