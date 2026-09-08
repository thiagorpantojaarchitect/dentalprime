import { describe, it, expect, beforeEach } from "vitest";

import { ForbiddenError } from "../domain/errors.js";
import { buildEnv, makeContext, PATIENT_A, TENANT_A, UNIT_A } from "./test-helpers.js";

const actor = makeContext();

describe("InvoiceService", () => {
  let env: ReturnType<typeof buildEnv>;
  beforeEach(() => {
    env = buildEnv();
  });

  it("cria fatura e calcula o total do item (preco x quantidade)", async () => {
    const invoice = await env.invoices.createInvoice(actor, PATIENT_A, UNIT_A);
    const consulta = await env.invoices.addItem(actor, invoice.id, {
      description: "Consulta",
      unitPriceCents: 15000,
    });
    expect(consulta.totalCents).toBe(15000);

    const raioX = await env.invoices.addItem(actor, invoice.id, {
      description: "Raio-X",
      unitPriceCents: 8000,
      quantity: 2,
    });
    expect(raioX.totalCents).toBe(16000);
  });

  it("papel patient nao pode criar fatura", async () => {
    await expect(
      env.invoices.createInvoice(makeContext({ roles: ["patient"] }), PATIENT_A, UNIT_A),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("consome TreatmentItemAccepted gerando fatura, idempotente", async () => {
    const input = {
      tenantId: TENANT_A,
      patientId: PATIENT_A,
      unitId: UNIT_A,
      sourceTreatmentItemId: "item-tratamento-1",
      description: "Canal",
      estimatedCost: "800.00",
      systemUserId: "system",
    };
    const first = await env.invoices.handleTreatmentItemAccepted(input);
    expect(first).not.toBeNull();
    expect(first!.totalCents).toBe(80000);
    expect(env.events.events.some((e) => e.type === "InvoiceIssued")).toBe(true);

    // Reprocessar o mesmo item nao duplica (idempotente).
    const second = await env.invoices.handleTreatmentItemAccepted(input);
    expect(second).toBeNull();
  });
});
