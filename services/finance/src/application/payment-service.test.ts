import { describe, it, expect, beforeEach } from "vitest";

import { PaymentExceedsBalanceError, ValidationError } from "../domain/errors.js";
import { buildEnv, makeContext, PATIENT_A, UNIT_A } from "./test-helpers.js";

const actor = makeContext();

describe("PaymentService", () => {
  let env: ReturnType<typeof buildEnv>;
  let invoiceId: string;

  beforeEach(async () => {
    env = buildEnv();
    const invoice = await env.invoices.createInvoice(actor, PATIENT_A, UNIT_A);
    invoiceId = invoice.id;
    await env.invoices.addItem(actor, invoiceId, {
      description: "Tratamento",
      unitPriceCents: 30000,
    });
  });

  it("pagamento parcial deixa a fatura partially_paid com saldo restante", async () => {
    const result = await env.payments.register(actor, {
      invoiceId,
      amountCents: 10000,
      method: "pix",
    });
    expect(result.invoice.status).toBe("partially_paid");
    expect(result.invoice.balanceCents).toBe(20000);
    expect(env.events.events.some((e) => e.type === "PaymentReceived")).toBe(true);
  });

  it("pagamento total quita a fatura", async () => {
    const result = await env.payments.register(actor, {
      invoiceId,
      amountCents: 30000,
      method: "card",
    });
    expect(result.invoice.status).toBe("paid");
    expect(result.invoice.balanceCents).toBe(0);
  });

  it("bloqueia pagamento acima do saldo", async () => {
    await expect(
      env.payments.register(actor, { invoiceId, amountCents: 40000, method: "cash" }),
    ).rejects.toBeInstanceOf(PaymentExceedsBalanceError);
  });

  it("rejeita valor invalido (zero)", async () => {
    await expect(
      env.payments.register(actor, { invoiceId, amountCents: 0, method: "cash" }),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it("idempotencia por externalRef nao aplica o pagamento duas vezes", async () => {
    const first = await env.payments.register(actor, {
      invoiceId,
      amountCents: 10000,
      method: "pix",
      externalRef: "gw-123",
    });
    expect(first.idempotentReplay).toBe(false);

    const second = await env.payments.register(actor, {
      invoiceId,
      amountCents: 10000,
      method: "pix",
      externalRef: "gw-123",
    });
    expect(second.idempotentReplay).toBe(true);
    // Saldo nao foi debitado de novo: continua 20000.
    expect(second.invoice.balanceCents).toBe(20000);
  });
});
