import { describe, it, expect, beforeEach } from "vitest";

import { sumCents } from "../domain/money.js";
import { buildEnv, makeContext, PATIENT_A, TENANT_A, UNIT_A } from "./test-helpers.js";

const actor = makeContext();

describe("PaymentPlanService", () => {
  let env: ReturnType<typeof buildEnv>;
  let invoiceId: string;

  beforeEach(async () => {
    env = buildEnv();
    const invoice = await env.invoices.createInvoice(actor, PATIENT_A, UNIT_A);
    invoiceId = invoice.id;
    await env.invoices.addItem(actor, invoiceId, {
      description: "Tratamento",
      unitPriceCents: 100000,
    });
  });

  it("parcela o saldo em N parcelas que somam o total", async () => {
    const installments = await env.plans.createPlan(actor, {
      invoiceId,
      installmentCount: 3,
      firstDueDate: new Date("2026-01-10T00:00:00Z"),
    });
    expect(installments).toHaveLength(3);
    expect(sumCents(installments.map((i) => i.amountCents))).toBe(100000);
    // Vencimentos mensais.
    expect(installments[1]!.dueDate.getUTCMonth()).toBe(1); // fevereiro
  });

  it("marca como overdue as parcelas em aberto vencidas", async () => {
    await env.plans.createPlan(actor, {
      invoiceId,
      installmentCount: 2,
      firstDueDate: new Date("2020-01-10T00:00:00Z"), // no passado
    });
    const marked = await env.plans.markOverdue(
      TENANT_A,
      new Date("2020-06-01T00:00:00Z"),
    );
    expect(marked).toBe(2);
    // Idempotente: rodar de novo nao marca mais nada.
    const again = await env.plans.markOverdue(TENANT_A, new Date("2020-06-01T00:00:00Z"));
    expect(again).toBe(0);
  });
});
