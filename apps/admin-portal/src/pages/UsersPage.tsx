/**
 * Visao de usuarios do tenant com seus papeis. Consome identity-access
 * (gestao de rede). Requer user:read. A gestao fina de papeis (convite,
 * troca de papel, desativacao) fica no clinic-web; aqui e visao consolidada.
 */

import { useCallback, useEffect, useState } from "react";

import { ApiError } from "../api/client.js";
import type { NetworkUser } from "../api/types.js";
import { useServices } from "../api/use-services.js";
import {
  EmptyState,
  ErrorBanner,
  PageHeader,
  Pagination,
  StatusBadge,
} from "../ui/components.js";

const PAGE_SIZE = 10;

function usersError(err: unknown, fallback: string): string {
  if (err instanceof ApiError) {
    if (err.code === "FORBIDDEN") return "Sem permissão para listar usuários.";
    if (err.code === "UNAUTHENTICATED") return "Sessão expirada. Entre novamente.";
  }
  return fallback;
}

function statusVariant(status: string): "default" | "success" | "warning" | "danger" {
  if (status === "active") return "success";
  if (status === "pending") return "warning";
  if (status === "disabled") return "danger";
  return "default";
}

export function UsersPage(): JSX.Element {
  const { network } = useServices();
  const [users, setUsers] = useState<readonly NetworkUser[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);

  const load = useCallback(
    async (requestedPage: number): Promise<void> => {
      setError(null);
      try {
        const result = await network.listUsers(requestedPage, PAGE_SIZE);
        setUsers(result.items);
        setHasMore(result.hasMore);
      } catch (err) {
        setError(usersError(err, "Não foi possível carregar os usuários."));
      } finally {
        setLoaded(true);
      }
    },
    [network],
  );

  useEffect(() => {
    void load(page);
  }, [load, page]);

  return (
    <section>
      <PageHeader title="Usuários" subtitle="Equipe do tenant e seus papéis." />
      <ErrorBanner message={error} />

      <div className="card wide">
        {users.length === 0 ? (
          <EmptyState message={loaded ? "Nenhum usuário encontrado." : "Carregando..."} />
        ) : (
          <table>
            <thead>
              <tr>
                <th>Nome</th>
                <th>E-mail</th>
                <th>Papéis</th>
                <th>Situação</th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id}>
                  <td>{u.displayName}</td>
                  <td>{u.email}</td>
                  <td>{u.roles.length > 0 ? u.roles.join(", ") : "-"}</td>
                  <td>
                    <StatusBadge status={u.status} variant={statusVariant(u.status)} />
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
