/**
 * Planos de tratamento: catalogo de procedimentos, criacao de plano por
 * paciente, itens e decisao de aceitacao de caso.
 *
 * Consome treatment-plan. Planos sao versionados. Uso de codigo de procedimento
 * licenciado sem acordo retorna LICENSED_CODE_BLOCKED (422).
 */

import { useCallback, useEffect, useState } from "react";

import { ApiError } from "../api/client.js";
import type { PlanItem, PlanRef, Procedure } from "../api/types.js";
import { useServices } from "../api/use-services.js";
import { isValidMoney } from "../lib/money.js";
import {
  CardForm,
  EmptyState,
  ErrorBanner,
  Field,
  PageHeader,
  SelectField,
  StatusBadge,
} from "../ui/components.js";

function treatmentError(err: unknown, fallback: string): string {
  if (err instanceof ApiError) {
    if (err.code === "LICENSED_CODE_BLOCKED") {
      return "Código de procedimento licenciado exige acordo formal.";
    }
    if (err.code === "VALIDATION") return "Dados inválidos.";
    if (err.code === "NOT_FOUND") return "Registro não encontrado.";
    if (err.code === "FORBIDDEN") return "Sem permissão para esta ação.";
  }
  return fallback;
}

export function TreatmentsPage(): JSX.Element {
  const { treatment } = useServices();

  const [procedures, setProcedures] = useState<readonly Procedure[]>([]);
  const [procError, setProcError] = useState<string | null>(null);

  // Catalogo
  const [name, setName] = useState("");
  const [baseCost, setBaseCost] = useState("");

  // Plano
  const [patientId, setPatientId] = useState("");
  const [title, setTitle] = useState("");
  const [plan, setPlan] = useState<PlanRef | null>(null);
  const [planError, setPlanError] = useState<string | null>(null);

  // Itens
  const [items, setItems] = useState<readonly PlanItem[]>([]);
  const [procedureId, setProcedureId] = useState("");
  const [estimatedCost, setEstimatedCost] = useState("");

  const loadProcedures = useCallback(async (): Promise<void> => {
    setProcError(null);
    try {
      setProcedures(await treatment.listProcedures());
    } catch (err) {
      setProcError(treatmentError(err, "Não foi possível carregar o catálogo."));
    }
  }, [treatment]);

  useEffect(() => {
    void loadProcedures();
  }, [loadProcedures]);

  const createProcedure = async (): Promise<void> => {
    setProcError(null);
    if (!isValidMoney(baseCost)) {
      setProcError("Custo base inválido (use formato 120.00).");
      return;
    }
    try {
      await treatment.createProcedure({ name, baseCost });
      setName("");
      setBaseCost("");
      await loadProcedures();
    } catch (err) {
      setProcError(treatmentError(err, "Não foi possível criar o procedimento."));
    }
  };

  const createPlan = async (): Promise<void> => {
    setPlanError(null);
    try {
      const ref = await treatment.createPlan(patientId, title);
      setPlan(ref);
      setItems([]);
    } catch (err) {
      setPlanError(treatmentError(err, "Não foi possível criar o plano."));
    }
  };

  const loadItems = useCallback(
    async (planKey: string): Promise<void> => {
      setPlanError(null);
      try {
        setItems(await treatment.listItems(planKey));
      } catch (err) {
        setPlanError(treatmentError(err, "Não foi possível carregar os itens."));
      }
    },
    [treatment],
  );

  const addItem = async (): Promise<void> => {
    if (!plan) return;
    setPlanError(null);
    if (estimatedCost && !isValidMoney(estimatedCost)) {
      setPlanError("Custo estimado inválido (use formato 120.00).");
      return;
    }
    try {
      await treatment.addItem(plan.planKey, {
        procedureId,
        estimatedCost: estimatedCost || null,
      });
      setProcedureId("");
      setEstimatedCost("");
      await loadItems(plan.planKey);
    } catch (err) {
      setPlanError(treatmentError(err, "Não foi possível adicionar o item."));
    }
  };

  const decide = async (
    decision: "accepted" | "declined" | "deferred",
  ): Promise<void> => {
    if (!plan) return;
    setPlanError(null);
    try {
      await treatment.decidePlan(plan.planKey, decision);
    } catch (err) {
      setPlanError(treatmentError(err, "Não foi possível registrar a decisão."));
    }
  };

  return (
    <section>
      <PageHeader
        title="Tratamentos"
        subtitle="Catálogo de procedimentos, planos e aceitação de casos."
      />

      <div className="grid-2">
        <CardForm
          title="Novo procedimento"
          label="Criar procedimento"
          onSubmit={createProcedure}
        >
          <Field id="procName" label="Nome" value={name} onChange={setName} required />
          <Field
            id="baseCost"
            label="Custo base (ex.: 120.00)"
            value={baseCost}
            onChange={setBaseCost}
            required
          />
          <ErrorBanner message={procError} />
          <button type="submit">Criar</button>
        </CardForm>

        <CardForm title="Novo plano" label="Criar plano" onSubmit={createPlan}>
          <Field
            id="planPatient"
            label="Paciente (id)"
            value={patientId}
            onChange={setPatientId}
            required
          />
          <Field
            id="planTitle"
            label="Título"
            value={title}
            onChange={setTitle}
            required
          />
          <ErrorBanner message={planError} />
          <button type="submit">Criar plano</button>
        </CardForm>
      </div>

      <div className="card wide" style={{ marginTop: 24 }}>
        <h3>Catálogo de procedimentos</h3>
        {procedures.length === 0 ? (
          <EmptyState message="Nenhum procedimento cadastrado." />
        ) : (
          <table>
            <thead>
              <tr>
                <th>Nome</th>
                <th>Descrição</th>
              </tr>
            </thead>
            <tbody>
              {procedures.map((p) => (
                <tr key={p.id}>
                  <td>{p.name}</td>
                  <td>{p.description ?? "-"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {plan ? (
        <div
          className="card wide stack"
          style={{ marginTop: 24 }}
          aria-label="Plano ativo"
        >
          <div className="row">
            <h3 style={{ margin: 0 }}>Plano</h3>
            <StatusBadge status={`v${plan.version}`} />
          </div>

          <CardForm title="Adicionar item" label="Adicionar item" onSubmit={addItem}>
            <SelectField
              id="itemProcedure"
              label="Procedimento"
              value={procedureId}
              onChange={setProcedureId}
              options={[
                { value: "", label: "Selecione..." },
                ...procedures.map((p) => ({ value: p.id, label: p.name })),
              ]}
            />
            <Field
              id="itemCost"
              label="Custo estimado (opcional)"
              value={estimatedCost}
              onChange={setEstimatedCost}
            />
            <button type="submit">Adicionar</button>
          </CardForm>

          <div>
            <h4>Itens</h4>
            {items.length === 0 ? (
              <EmptyState message="Nenhum item no plano." />
            ) : (
              <table>
                <thead>
                  <tr>
                    <th>Procedimento</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((it) => (
                    <tr key={it.id}>
                      <td>{it.procedureId}</td>
                      <td>
                        <StatusBadge status={it.status} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          <div className="row">
            <span className="muted">Decisão de aceitação:</span>
            <button type="button" onClick={() => void decide("accepted")}>
              Aceitar
            </button>
            <button
              type="button"
              className="secondary"
              onClick={() => void decide("deferred")}
            >
              Adiar
            </button>
            <button
              type="button"
              className="danger"
              onClick={() => void decide("declined")}
            >
              Recusar
            </button>
          </div>
        </div>
      ) : null}
    </section>
  );
}
