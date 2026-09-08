import { describe, it, expect, beforeEach } from "vitest";

import { ConsentRequiredError } from "../domain/errors.js";
import { buildServices, makeContext, TENANT_A, VALID_CPF_1 } from "./test-helpers.js";

describe("ConsentService", () => {
  let env: ReturnType<typeof buildServices>;
  let patientId: string;
  const actor = makeContext();

  beforeEach(async () => {
    env = buildServices();
    const patient = await env.patients.register(actor, {
      fullName: "Maria Silva",
      cpf: VALID_CPF_1,
    });
    patientId = patient.id;
  });

  it("sem consentimento, ensureConsent bloqueia", async () => {
    await expect(
      env.consents.ensureConsent(TENANT_A, patientId, "clinical_care"),
    ).rejects.toBeInstanceOf(ConsentRequiredError);
  });

  it("apos conceder, ha consentimento vigente", async () => {
    await env.consents.grant(actor, patientId, "clinical_care", "v1");
    expect(await env.consents.hasConsent(TENANT_A, patientId, "clinical_care")).toBe(
      true,
    );
    await env.consents.ensureConsent(TENANT_A, patientId, "clinical_care");
  });

  it("revogacao remove o consentimento vigente e audita", async () => {
    await env.consents.grant(actor, patientId, "billing", "v1");
    await env.consents.revoke(actor, patientId, "billing", "v1");
    expect(await env.consents.hasConsent(TENANT_A, patientId, "billing")).toBe(false);

    const actions = env.auditRepo.entries.map((e) => e.action);
    expect(actions).toContain("consent.granted");
    expect(actions).toContain("consent.revoked");
  });
});
