import { describe, it, expect, beforeEach } from "vitest";

import { ValidationError } from "../domain/errors.js";
import { buildEnv, makeContext, PATIENT_A } from "./test-helpers.js";

const actor = makeContext({ roles: ["dentist"] });

describe("PlanItemService", () => {
  let env: ReturnType<typeof buildEnv>;
  let planKey: string;
  let procedureId: string;

  beforeEach(async () => {
    env = buildEnv();
    const proc = await env.procedures.create(actor, {
      name: "Limpeza",
      baseCost: "150.00",
    });
    procedureId = proc.id;
    const plan = await env.plans.create(actor, PATIENT_A, "Plano");
    planKey = plan.planKey;
  });

  it("usa o custo base do procedimento quando estimatedCost nao e informado", async () => {
    const item = await env.items.addItem(actor, { planKey, procedureId });
    expect(item.estimatedCost).toBe("150.00");
    expect(item.status).toBe("proposed");
  });

  it("segue transicoes validas proposed -> accepted -> in_progress -> completed", async () => {
    const item = await env.items.addItem(actor, { planKey, procedureId });
    await env.items.changeStatus(actor, item.id, "accepted");
    await env.items.changeStatus(actor, item.id, "in_progress");
    const done = await env.items.changeStatus(actor, item.id, "completed");
    expect(done.status).toBe("completed");
    expect(env.events.events.some((e) => e.type === "TreatmentItemCompleted")).toBe(true);
  });

  it("rejeita transicao invalida (proposed -> completed)", async () => {
    const item = await env.items.addItem(actor, { planKey, procedureId });
    await expect(
      env.items.changeStatus(actor, item.id, "completed"),
    ).rejects.toBeInstanceOf(ValidationError);
  });
});
