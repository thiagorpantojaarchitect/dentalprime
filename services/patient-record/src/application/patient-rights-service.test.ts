import { describe, it, expect, beforeEach } from "vitest";

import { buildServices, makeContext, VALID_CPF_1 } from "./test-helpers.js";

describe("PatientRightsService.requestErasure", () => {
  let env: ReturnType<typeof buildServices>;
  let patientId: string;
  const actor = makeContext({ roles: ["manager"] });

  beforeEach(async () => {
    env = buildServices();
    const patient = await env.patients.register(actor, {
      fullName: "Maria Silva",
      cpf: VALID_CPF_1,
      email: "maria@exemplo.com",
    });
    patientId = patient.id;
  });

  it("sem prontuario clinico, apenas desativa", async () => {
    const outcome = await env.rights.requestErasure(actor, patientId);
    expect(outcome.result).toBe("deactivated");
    const patient = await env.patients.getById(actor, patientId);
    expect(patient.active).toBe(false);
  });

  it("com prontuario clinico, anonimiza e preserva o prontuario", async () => {
    await env.records.createEntry(actor, {
      patientId,
      entryType: "evolution",
      content: "Registro que deve ser preservado.",
    });

    const outcome = await env.rights.requestErasure(actor, patientId);
    expect(outcome.result).toBe("anonymized");

    const patient = await env.patients.getById(actor, patientId);
    expect(patient.fullName).toBe("TITULAR ANONIMIZADO");
    expect(patient.email).toBeNull();
    expect(patient.active).toBe(false);

    // Prontuario preservado.
    const records = await env.records.listForPatient(actor, patientId);
    expect(records).toHaveLength(1);
    expect(records[0]!.content).toBe("Registro que deve ser preservado.");
  });

  it("audita a operacao de direitos", async () => {
    await env.rights.export(actor, patientId);
    expect(env.auditRepo.entries.some((e) => e.action === "patient.data_exported")).toBe(
      true,
    );
  });
});
