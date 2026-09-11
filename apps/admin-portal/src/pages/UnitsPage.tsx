/**
 * Gestao de unidades clinicas do tenant: listar, criar e desativar.
 * Consome identity-access (gestao de rede). Requer unit:manage/unit:read (RBAC
 * aplicado pelo backend).
 */

import { useCallback, useEffect, useState } from "react";

import { ApiError } from "../api/client.js";
import type { ClinicUnit } from "../api/types.js";
import { useServices } from "../api/use-services.js";
import {
  CardForm,
  EmptyState,
  ErrorBanner,
  Field,
  PageHeader,
  StatusBadge,
} from "../ui/components.js";

function unitError(err: unknown, fallback: string): string {
  if (err instanceof ApiError) {
    if (err.code === "FORBIDDEN") return "Sem permissão para gerenciar unidades.";
    if (err.code === "VALIDATION") return "Dados inválidos.";
    if (err.code === "NOT_FOUND") return "Unidade não encontrada.";
  }
  return fallback;
}

export function UnitsPage(): JSX.Element {
  const { network } = useServices();
  const [units, setUnits] = useState<readonly ClinicUnit[]>([]);
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);

  const load = useCallback(async (): Promise<void> => {
    setError(null);
    try {
      setUnits(await network.listUnits());
    } catch (err) {
      setError(unitError(err, "Não foi possível carregar as unidades."));
    } finally {
      setLoaded(true);
    }
  }, [network]);

  useEffect(() => {
    void load();
  }, [load]);

  const create = async (): Promise<void> => {
    setError(null);
    try {
      await network.createUnit(name);
      setName("");
      await load();
    } catch (err) {
      setError(unitError(err, "Não foi possível criar a unidade."));
    }
  };

  const deactivate = async (unitId: string): Promise<void> => {
    setError(null);
    try {
      await network.deactivateUnit(unitId);
      await load();
    } catch (err) {
      setError(unitError(err, "Não foi possível desativar a unidade."));
    }
  };

  return (
    <section>
      <PageHeader title="Unidades" subtitle="Unidades físicas do tenant." />

      <div className="grid-2">
        <CardForm title="Nova unidade" label="Criar unidade" onSubmit={create}>
          <Field id="unitName" label="Nome" value={name} onChange={setName} required />
          <ErrorBanner message={error} />
          <button type="submit">Criar</button>
        </CardForm>
      </div>

      <div className="card wide" style={{ marginTop: 24 }}>
        <h3>Unidades cadastradas</h3>
        {units.length === 0 ? (
          <EmptyState
            message={loaded ? "Nenhuma unidade cadastrada." : "Carregando..."}
          />
        ) : (
          <table>
            <thead>
              <tr>
                <th>Nome</th>
                <th>Situação</th>
                <th aria-label="Ações" />
              </tr>
            </thead>
            <tbody>
              {units.map((u) => (
                <tr key={u.id}>
                  <td>{u.name}</td>
                  <td>
                    <StatusBadge
                      status={u.active ? "ativa" : "inativa"}
                      variant={u.active ? "success" : "danger"}
                    />
                  </td>
                  <td>
                    {u.active ? (
                      <button
                        type="button"
                        className="danger"
                        onClick={() => void deactivate(u.id)}
                      >
                        Desativar
                      </button>
                    ) : null}
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
