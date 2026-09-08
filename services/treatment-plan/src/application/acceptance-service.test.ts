import { describe, it, expect, beforeEach } from "vitest";

import { buildEnv, makeContext, PATIENT_A } from "./test-helpers.js";

const actor = makeContext({ roles: ["dentist"] });

describe("AcceptanceService", () => {
  let env: ReturnType<typeof buildEnv>;
  let planKey: string;
  let itemId: string;

  beforeEach(async () => {
    env = buildEnv();
    const proc = await env.procedures.create(actor, {
      name: "Canal",
      baseCost: "800.00",
    });
    const plan = await env.plans.create(actor, PATIENT_A, "Plano");
    planKey = plan.planKey;
    const item = await env.items.addItem(actor, {
      planKey,
      procedureId: proc.id,
    });
    itemId = item.id;
  });

  it("aceitar item marca como accepted e publica TreatmentItemAccepted para finance", async () => {
    const acceptance = await env.acceptance.decideItem(
      actor,
      planKey,
      itemId,
      "accepted",
    );
    expect(acceptance.decision).toBe("accepted");

    const items = await env.items.listForCurrentPlan(actor, planKey);
    expect(items[0]!.status).toBe("accepted");

    const event = env.events.events.find((e) => e.type === "TreatmentItemAccepted");
    expect(event).toBeDefined();
    expect((event!.payload as { estimatedCost: string }).estimatedCost).toBe("800.00");
  });

  it("recusar item registra decisao sem publicar evento de aceitacao", async () => {
    await env.acceptance.decideItem(actor, planKey, itemId, "declined");
    expect(env.events.events.some((e) => e.type === "TreatmentItemAccepted")).toBe(false);

    const history = await env.acceptance.history(actor, planKey);
    expect(history.some((a) => a.decision === "declined")).toBe(true);
  });

  it("decisao sobre o plano inteiro e registrada", async () => {
    await env.acceptance.decidePlan(actor, planKey, "accepted", "Paciente aprovou");
    const history = await env.acceptance.history(actor, planKey);
    expect(history.some((a) => a.itemId === null && a.decision === "accepted")).toBe(
      true,
    );
  });
});
