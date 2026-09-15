/**
 * Gestao de tenants (operacao de plataforma). Lista tenants e provisiona novos,
 * criando o owner inicial (pendente de ativacao). Requer tenant:manage; o RBAC
 * e aplicado pelo backend e retorna FORBIDDEN quando nao autorizado.
 */

import { useCallback, useEffect, useState } from "react";

import { ApiError } from "../api/client.js";
import type { ProvisionedTenant, Tenant } from "../api/types.js";
import { useServices } from "../api/use-services.js";
import {
  CardForm,
  EmptyState,
  ErrorBanner,
  Field,
  PageHeader,
  Pagination,
  StatusBadge,
} from "../ui/components.js";

const PAGE_SIZE = 10;

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
  const [provisioned, setProvisioned] = useState<ProvisionedTenant | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);

  const load = useCallback(
    async (requestedPage: number): Promise<void> => {
      setError(null);
      try {
        const result = await network.listTenants(requestedPage, PAGE_SIZE);
        setTenants(result.items);
        setHasMore(result.hasMore);
      } catch (err) {
        setError(tenantError(err, "Não foi possível carregar os tenants."));
      } finally {
        setLoaded(true);
      }
    },
    [network],
  );

  useEffect(() => {
    void load(page);
  }, [load, page]);

  const provision = async (): Promise<void> => {
    setError(null);
    setMessage(null);
    setProvisioned(null);
    try {
      const created = await network.provisionTenant({ name, ownerEmail, ownerName });
      setMessage(`Tenant "${created.name}" provisionado. Owner pendente de ativação.`);
      setProvisioned(created);
      setName("");
      setOwnerEmail("");
      setOwnerName("");
      if (page === 1) await load(1);
      else setPage(1);
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
        {provisioned ? (
          <div className="notice stack" role="status">
            <div className="field">
              <label htmlFor="ownerActivationToken">
                Token do owner (exibido uma única vez)
              </label>
              <input
                id="ownerActivationToken"
                value={provisioned.ownerActivationToken}
                readOnly
                autoComplete="off"
                spellCheck={false}
              />
            </div>
            <small>
              Expira em{" "}
              {new Date(provisioned.ownerActivationExpiresAt).toLocaleString("pt-BR")}.
              Compartilhe por canal seguro.
            </small>
          </div>
        ) : null}
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
        <Pagination page={page} hasMore={hasMore} onPageChange={setPage} />
      </div>
    </section>
  );
}
