/**
 * Financeiro: cria fatura, adiciona itens, registra pagamentos, parcela e
 * concilia. Consome finance.
 *
 * Valores de entrada sao decimal-string ("120.00"); as respostas vem em centavos
 * e sao formatadas em BRL. Pagamento acima do saldo retorna
 * PAYMENT_EXCEEDS_BALANCE (409).
 */

import { useState } from "react";

import { ApiError } from "../api/client.js";
import type { CreatedInvoice, Installment, PaymentResult } from "../api/types.js";
import { useServices } from "../api/use-services.js";
import { formatCents, isValidMoney } from "../lib/money.js";
import {
  CardForm,
  EmptyState,
  ErrorBanner,
  Field,
  PageHeader,
  SelectField,
  StatusBadge,
} from "../ui/components.js";

function financeError(err: unknown, fallback: string): string {
  if (err instanceof ApiError) {
    if (err.code === "PAYMENT_EXCEEDS_BALANCE") {
      return "O pagamento excede o saldo da fatura.";
    }
    if (err.code === "VALIDATION") return "Dados inválidos.";
    if (err.code === "NOT_FOUND") return "Fatura não encontrada.";
    if (err.code === "FORBIDDEN") return "Sem permissão para esta ação.";
  }
  return fallback;
}

const METHODS = [
  { value: "pix", label: "PIX" },
  { value: "card", label: "Cartão" },
  { value: "cash", label: "Dinheiro" },
  { value: "boleto", label: "Boleto" },
  { value: "transfer", label: "Transferência" },
];

export function FinancePage(): JSX.Element {
  const { finance } = useServices();

  const [patientId, setPatientId] = useState("");
  const [unitId, setUnitId] = useState("");
  const [invoice, setInvoice] = useState<CreatedInvoice | null>(null);
  const [invoiceError, setInvoiceError] = useState<string | null>(null);

  const [description, setDescription] = useState("");
  const [unitPrice, setUnitPrice] = useState("");
  const [itemError, setItemError] = useState<string | null>(null);
  const [lastItemTotal, setLastItemTotal] = useState<number | null>(null);

  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState("pix");
  const [payment, setPayment] = useState<PaymentResult | null>(null);
  const [payError, setPayError] = useState<string | null>(null);

  const [installmentCount, setInstallmentCount] = useState("");
  const [firstDueDate, setFirstDueDate] = useState("");
  const [installments, setInstallments] = useState<readonly Installment[]>([]);
  const [planError, setPlanError] = useState<string | null>(null);

  const createInvoice = async (): Promise<void> => {
    setInvoiceError(null);
    try {
      setInvoice(await finance.createInvoice({ patientId, unitId }));
      setPayment(null);
      setInstallments([]);
      setLastItemTotal(null);
    } catch (err) {
      setInvoiceError(financeError(err, "Não foi possível criar a fatura."));
    }
  };

  const addItem = async (): Promise<void> => {
    if (!invoice) return;
    setItemError(null);
    if (!isValidMoney(unitPrice)) {
      setItemError("Preço inválido (use formato 120.00).");
      return;
    }
    try {
      const item = await finance.addItem(invoice.id, { description, unitPrice });
      setLastItemTotal(item.totalCents);
      setDescription("");
      setUnitPrice("");
    } catch (err) {
      setItemError(financeError(err, "Não foi possível adicionar o item."));
    }
  };

  const pay = async (): Promise<void> => {
    if (!invoice) return;
    setPayError(null);
    if (!isValidMoney(amount)) {
      setPayError("Valor inválido (use formato 120.00).");
      return;
    }
    try {
      const result = await finance.pay(invoice.id, {
        amount,
        method: method as "cash" | "card" | "pix" | "boleto" | "transfer",
      });
      setPayment(result);
    } catch (err) {
      setPayError(financeError(err, "Não foi possível registrar o pagamento."));
    }
  };

  const createPlan = async (): Promise<void> => {
    if (!invoice) return;
    setPlanError(null);
    const count = Number(installmentCount);
    if (!Number.isInteger(count) || count <= 0) {
      setPlanError("Número de parcelas inválido.");
      return;
    }
    try {
      const list = await finance.createPaymentPlan(
        invoice.id,
        count,
        new Date(firstDueDate).toISOString(),
      );
      setInstallments(list);
    } catch (err) {
      setPlanError(financeError(err, "Não foi possível parcelar."));
    }
  };

  return (
    <section>
      <PageHeader
        title="Financeiro"
        subtitle="Faturas, pagamentos, parcelamento e conciliação."
      />

      <CardForm title="Nova fatura" label="Criar fatura" onSubmit={createInvoice}>
        <Field
          id="invPatient"
          label="Paciente (id)"
          value={patientId}
          onChange={setPatientId}
          required
        />
        <Field
          id="invUnit"
          label="Unidade (id)"
          value={unitId}
          onChange={setUnitId}
          required
        />
        <ErrorBanner message={invoiceError} />
        <button type="submit">Criar fatura</button>
      </CardForm>

      {invoice ? (
        <div className="stack" style={{ marginTop: 24 }}>
          <div className="card wide">
            <div className="row">
              <h3 style={{ margin: 0 }}>Fatura</h3>
              <StatusBadge status={invoice.status} />
            </div>
          </div>

          <div className="grid-2">
            <CardForm title="Adicionar item" label="Adicionar item" onSubmit={addItem}>
              <Field
                id="itemDesc"
                label="Descrição"
                value={description}
                onChange={setDescription}
                required
              />
              <Field
                id="itemPrice"
                label="Preço (ex.: 120.00)"
                value={unitPrice}
                onChange={setUnitPrice}
                required
              />
              <ErrorBanner message={itemError} />
              {lastItemTotal !== null ? (
                <p className="muted">Item adicionado: {formatCents(lastItemTotal)}</p>
              ) : null}
              <button type="submit">Adicionar</button>
            </CardForm>

            <CardForm
              title="Registrar pagamento"
              label="Registrar pagamento"
              onSubmit={pay}
            >
              <Field
                id="payAmount"
                label="Valor (ex.: 120.00)"
                value={amount}
                onChange={setAmount}
                required
              />
              <SelectField
                id="payMethod"
                label="Método"
                value={method}
                onChange={setMethod}
                options={METHODS}
              />
              <ErrorBanner message={payError} />
              {payment ? (
                <p className="muted">
                  Status: {payment.invoiceStatus} — saldo{" "}
                  {formatCents(payment.balanceCents)}
                  {payment.idempotentReplay ? " (repetição idempotente)" : ""}
                </p>
              ) : null}
              <button type="submit">Pagar</button>
            </CardForm>
          </div>

          <CardForm title="Parcelamento" label="Parcelar fatura" onSubmit={createPlan}>
            <Field
              id="planCount"
              label="Nº de parcelas"
              type="number"
              value={installmentCount}
              onChange={setInstallmentCount}
              required
            />
            <Field
              id="planFirst"
              label="Primeiro vencimento"
              type="datetime-local"
              value={firstDueDate}
              onChange={setFirstDueDate}
              required
            />
            <ErrorBanner message={planError} />
            <button type="submit">Gerar parcelas</button>
          </CardForm>

          {installments.length > 0 ? (
            <div className="card wide">
              <h3>Parcelas</h3>
              <table>
                <thead>
                  <tr>
                    <th>#</th>
                    <th>Valor</th>
                    <th>Vencimento</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {installments.map((inst, idx) => (
                    <tr key={inst.id}>
                      <td>{inst.sequence ?? idx + 1}</td>
                      <td>
                        {inst.amountCents !== undefined
                          ? formatCents(inst.amountCents)
                          : "-"}
                      </td>
                      <td>
                        {inst.dueDate
                          ? new Date(inst.dueDate).toLocaleDateString("pt-BR")
                          : "-"}
                      </td>
                      <td>{inst.status ? <StatusBadge status={inst.status} /> : "-"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <EmptyState message="Sem parcelamento gerado." />
          )}
        </div>
      ) : null}
    </section>
  );
}
