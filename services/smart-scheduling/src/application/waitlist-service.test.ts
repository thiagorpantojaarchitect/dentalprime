import { describe, it, expect } from "vitest";

import { ForbiddenError } from "../domain/errors.js";
import { buildEnv, makeContext, seedProvider, UNIT_A } from "./test-helpers.js";

const actor = makeContext();
const patientA = "aaaa1111-1111-1111-1111-111111111111";
const patientB = "bbbb2222-2222-2222-2222-222222222222";

describe("WaitlistService", () => {
  it("sugere candidatos por ordem de prioridade (assistivo)", async () => {
    const env = buildEnv();
    const providerId = await seedProvider(env);

    await env.waitlist.add(actor, {
      patientId: patientA,
      unitId: UNIT_A,
      providerId,
      priority: 1,
    });
    await env.waitlist.add(actor, {
      patientId: patientB,
      unitId: UNIT_A,
      providerId,
      priority: 5,
    });

    const suggestions = await env.waitlist.suggestForProvider(actor, providerId);
    expect(suggestions[0]!.patientId).toBe(patientB); // maior prioridade primeiro
    expect(suggestions[1]!.patientId).toBe(patientA);
  });

  it("marca entrada como atendida e audita", async () => {
    const env = buildEnv();
    const providerId = await seedProvider(env);
    const entry = await env.waitlist.add(actor, {
      patientId: patientA,
      unitId: UNIT_A,
      providerId,
    });
    await env.waitlist.markFulfilled(actor, entry.id);
    const remaining = await env.waitlist.suggestForProvider(actor, providerId);
    expect(remaining).toHaveLength(0);
    expect(env.auditRepo.entries.some((e) => e.action === "waitlist.fulfilled")).toBe(
      true,
    );
  });

  it("papel patient nao pode adicionar a lista de espera", async () => {
    const env = buildEnv();
    const providerId = await seedProvider(env);
    await expect(
      env.waitlist.add(makeContext({ roles: ["patient"] }), {
        patientId: patientA,
        unitId: UNIT_A,
        providerId,
      }),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });
});
