import { describe, it, expect } from "vitest";

import { ValidationError } from "../domain/errors.js";
import { buildEnv, makeContext } from "./test-helpers.js";

const actor = makeContext();

describe("PayoutService", () => {
  it("calcula repasse por taxa em pontos-base", async () => {
    const env = buildEnv();
    const payout = await env.payouts.compute(actor, {
      providerId: "33333333-3333-3333-3333-333333333333",
      invoiceItemId: "44444444-4444-4444-4444-444444444444",
      baseCents: 80000,
      rateBasisPoints: 5000, // 50%
    });
    expect(payout.amountCents).toBe(40000);
  });

  it("rejeita taxa fora do intervalo", async () => {
    const env = buildEnv();
    await expect(
      env.payouts.compute(actor, {
        providerId: "33333333-3333-3333-3333-333333333333",
        invoiceItemId: "44444444-4444-4444-4444-444444444444",
        baseCents: 80000,
        rateBasisPoints: 20000,
      }),
    ).rejects.toBeInstanceOf(ValidationError);
  });
});

describe("ReconciliationService", () => {
  it("marca matched quando valores batem", async () => {
    const env = buildEnv();
    const rec = await env.reconciliation.reconcile(actor, {
      reference: "lote-1",
      expectedCents: 50000,
      receivedCents: 50000,
    });
    expect(rec.status).toBe("matched");
    expect(rec.differenceCents).toBe(0);
  });

  it("marca divergent e registra a diferenca", async () => {
    const env = buildEnv();
    const rec = await env.reconciliation.reconcile(actor, {
      reference: "lote-2",
      expectedCents: 50000,
      receivedCents: 49900,
    });
    expect(rec.status).toBe("divergent");
    expect(rec.differenceCents).toBe(-100);
  });
});
