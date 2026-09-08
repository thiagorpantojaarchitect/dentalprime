import { describe, it, expect, beforeEach } from "vitest";

import { NotFoundError } from "../domain/errors.js";
import { buildEnv, makeContext, PATIENT_A, TENANT_B } from "./test-helpers.js";

const actor = makeContext();

describe("TreatmentPlanService versionamento", () => {
  let env: ReturnType<typeof buildEnv>;
  beforeEach(() => {
    env = buildEnv();
  });

  it("cria plano na versao 1 e publica evento", async () => {
    const plan = await env.plans.create(actor, PATIENT_A, "Plano inicial");
    expect(plan.version).toBe(1);
    expect(plan.status).toBe("draft");
    expect(env.events.events.some((e) => e.type === "TreatmentPlanCreated")).toBe(true);
  });

  it("revisao cria nova versao e preserva o historico", async () => {
    const v1 = await env.plans.create(actor, PATIENT_A, "Plano inicial");
    const v2 = await env.plans.revise(actor, v1.planKey, "Plano revisado");
    expect(v2.version).toBe(2);

    const history = await env.plans.history(actor, v1.planKey);
    expect(history.map((p) => p.version)).toEqual([1, 2]);
    expect(history[0]!.supersededByVersion).toBe(2);

    const current = await env.plans.current(actor, v1.planKey);
    expect(current.version).toBe(2);
    expect(current.title).toBe("Plano revisado");
  });

  it("isolamento: outro tenant nao acessa o plano", async () => {
    const v1 = await env.plans.create(actor, PATIENT_A, "Plano");
    await expect(
      env.plans.current(makeContext({ tenantId: TENANT_B }), v1.planKey),
    ).rejects.toBeInstanceOf(NotFoundError);
  });
});
