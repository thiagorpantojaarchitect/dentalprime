/**
 * Gestao de tenants (operacao de plataforma). Lista tenants e provisiona novos,
 * criando o owner inicial (pendente de ativacao). Requer tenant:manage; o RBAC
 * e aplicado pelo backend e retorna FORBIDDEN quando nao autorizado.
 */

import { useCallback, useEffect, useState } from "react";

import { ApiError } from "../api/client.js";
import type { Tenant } from "../api/types.js";
import { useServices } from "../api/use-services.js";
import {
  CardForm,
  EmptyState,
  ErrorBanner,
  Field,
  PageHeader,
  StatusBadge,
} from "../ui/components.js";

function tenantError(err: unknown, fallback: string): string {
  if (err instanceof ApiError) {
    if (err.code === "FORBIDDEN") {
      return "Operação de plataforma: requer permissão de administração.";
    }
    if (err.code === "VALIDATION") return "Dados inválidos.";
    if (err.code === "CONFLICT") return "Já existe um tenant com estes dados.";
  }
  return fallback;
}

export function TenantsPage(): JSX.Element {
  const { network } = useServices();
  const [tenants, setTenants] = useState<readonly Tenant[]>([]);
  const [name, setName] = useState("");
  const [ownerEmail, setOwnerEmail] = useState("");
  const [ownerName, setOwnerName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);

  const load = useCallback(async (): Promise<void> => {
    setError(null);
    try {
      setTenants(await network.listTenants());
    } catch (err) {
      setError(tenantError(err, "Não foi possível carregar os tenants."));
    } finally {
      setLoaded(true);
    }
  }, [network]);

  useEffect(() => {
    void load();
  }, [load]);

  const provision = async (): Promise<void> => {
    setError(null);
    setMessage(null);
    try {
      const created = await network.provisionTenant({ name, ownerEmail, ownerName });
      setMessage(`Tenant "${created.name}" provisionado. Owner pendente de ativação.`);
      setName("");
      setOwnerEmail("");
      setOwnerName("");
      await load();
    } catch (err) {
      setError(tenantError(err, "Não foi possível provisionar o tenant."));
    }
  };

  return (
    <section>
      <PageHeader
        title="Tenants"
        subtitle="Provisionamento de clínicas e redes (operação de plataforma)."
      />

      <CardForm
        title="Provisionar tenant"
        label="Provisionar tenant"
        onSubmit={provision}
      >
        <Field
          id="tenantName"
          label="Nome da clínica/rede"
          value={name}
          onChange={setName}
          required
        />
        <Field
          id="ownerName"
          label="Nome do responsável"
          value={ownerName}
          onChange={setOwnerName}
          required
        />
        <Field
          id="ownerEmail"
          label="E-mail do responsável"
          type="email"
          value={ownerEmail}
          onChange={setOwnerEmail}
          required
        />
        <ErrorBanner message={error} />
        {message ? <p className="muted">{message}</p> : null}
        <button type="submit">Provisionar</button>
      </CardForm>

      <div className="card wide" style={{ marginTop: 24 }}>
        <h3>Tenants</h3>
        {tenants.length === 0 ? (
          <EmptyState message={loaded ? "Nenhum tenant visível." : "Carregando..."} />
        ) : (
          <table>
            <thead>
              <tr>
                <th>Nome</th>
                <th>Situação</th>
              </tr>
            </thead>
            <tbody>
              {tenants.map((t) => (
                <tr key={t.id}>
                  <td>{t.name}</td>
                  <td>
                    <StatusBadge
                      status={t.active ? "ativo" : "inativo"}
                      variant={t.active ? "success" : "danger"}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </section>
  );
}
