import { describe, it, expect, beforeEach } from "vitest";

import { buildEnv, makeContext, TENANT_A } from "./test-helpers.js";

const actor = makeContext();

describe("Consent + Campaign (LGPD)", () => {
  let env: ReturnType<typeof buildEnv>;
  beforeEach(() => {
    env = buildEnv();
  });

  it("sem opt-in, contato NAO e elegivel (opt-in explicito exigido)", async () => {
    const ok = await env.consent.isEligible(
      TENANT_A,
      "contato-1",
      "reactivation",
      "email",
    );
    expect(ok).toBe(false);
  });

  it("opt-in torna elegivel; opt-out posterior bloqueia", async () => {
    await env.consent.optIn(actor, "contato-1", "reactivation", "email");
    expect(
      await env.consent.isEligible(TENANT_A, "contato-1", "reactivation", "email"),
    ).toBe(true);

    await env.consent.optOut(actor, "contato-1", "reactivation", "email");
    expect(
      await env.consent.isEligible(TENANT_A, "contato-1", "reactivation", "email"),
    ).toBe(false);
  });

  it("selecao de publico exclui quem nao tem opt-in / fez opt-out", async () => {
    const campaign = await env.campaigns.create(actor, {
      name: "Reativacao",
      purpose: "reactivation",
      channel: "email",
    });

    await env.consent.optIn(actor, "elegivel", "reactivation", "email");
    await env.consent.optIn(actor, "saiu", "reactivation", "email");
    await env.consent.optOut(actor, "saiu", "reactivation", "email");
    // "sem-consentimento" nunca deu opt-in.

    const result = await env.campaigns.selectAudience(actor, campaign.id, [
      "elegivel",
      "saiu",
      "sem-consentimento",
    ]);

    expect(result.eligible).toEqual(["elegivel"]);
    expect(result.excluded.sort()).toEqual(["saiu", "sem-consentimento"]);
    expect(
      env.auditRepo.entries.some((e) => e.action === "campaign.audience_selected"),
    ).toBe(true);
  });

  it("opt-out em um canal nao afeta outro canal", async () => {
    await env.consent.optIn(actor, "contato-x", "reactivation", "email");
    await env.consent.optIn(actor, "contato-x", "reactivation", "whatsapp");
    await env.consent.optOut(actor, "contato-x", "reactivation", "email");

    expect(
      await env.consent.isEligible(TENANT_A, "contato-x", "reactivation", "email"),
    ).toBe(false);
    expect(
      await env.consent.isEligible(TENANT_A, "contato-x", "reactivation", "whatsapp"),
    ).toBe(true);
  });
});
