import { describe, it, expect, beforeEach } from "vitest";

import { ForbiddenError } from "../domain/errors.js";
import { buildEnv, makeContext, PATIENT_A, UNIT_A } from "./test-helpers.js";

const actor = makeContext();

describe("DashboardService.financeSummary", () => {
  let env: ReturnType<typeof buildEnv>;

  beforeEach(() => {
    env = buildEnv();
  });

  it("tenant sem faturas: todos os status zerados", async () => {
    const dash = await env.dashboard.financeSummary(actor);
    expect(dash.totalInvoices).toBe(0);
    expect(dash.billedCents).toBe(0);
    expect(dash.receivedCents).toBe(0);
    expect(dash.outstandingCents).toBe(0);
    // Sempre expoe os 4 status em ordem estavel.
    expect(dash.byStatus.map((b) => b.status)).toEqual([
      "open",
      "partially_paid",
      "paid",
      "cancelled",
    ]);
    expect(dash.byStatus.every((b) => b.count === 0)).toBe(true);
  });

  it("agrega faturas por status e calcula recebido e a receber", async () => {
    // Fatura 1: 150,00 paga integralmente.
    const inv1 = await env.invoices.createInvoice(actor, PATIENT_A, UNIT_A);
    await env.invoices.addItem(actor, inv1.id, {
      description: "Consulta",
      unitPriceCents: 15000,
    });
    await env.payments.register(actor, {
      invoiceId: inv1.id,
      amountCents: 15000,
      method: "pix",
      externalRef: null,
    });

    // Fatura 2: 200,00 com pagamento parcial de 50,00 (saldo 150,00).
    const inv2 = await env.invoices.createInvoice(actor, PATIENT_A, UNIT_A);
    await env.invoices.addItem(actor, inv2.id, {
      description: "Procedimento",
      unitPriceCents: 20000,
    });
    await env.payments.register(actor, {
      invoiceId: inv2.id,
      amountCents: 5000,
      method: "cash",
      externalRef: null,
    });

    const dash = await env.dashboard.financeSummary(actor);

    expect(dash.totalInvoices).toBe(2);
    // Faturado ativo: 150 + 200 = 350,00.
    expect(dash.billedCents).toBe(35000);
    // A receber: 0 + 150 = 150,00.
    expect(dash.outstandingCents).toBe(15000);
    // Recebido: 350 - 150 = 200,00.
    expect(dash.receivedCents).toBe(20000);

    const paid = dash.byStatus.find((b) => b.status === "paid");
    const partial = dash.byStatus.find((b) => b.status === "partially_paid");
    expect(paid?.count).toBe(1);
    expect(paid?.balanceCents).toBe(0);
    expect(partial?.count).toBe(1);
    expect(partial?.balanceCents).toBe(15000);
  });

  it("registra auditoria de visualizacao do painel", async () => {
    await env.dashboard.financeSummary(actor);
    expect(
      env.auditRepo.entries.some((e) => e.action === "finance.dashboard_viewed"),
    ).toBe(true);
  });

  it("papel sem finance:read nao acessa o painel", async () => {
    await expect(
      env.dashboard.financeSummary(makeContext({ roles: ["assistant"] })),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });
});
