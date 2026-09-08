import { describe, it, expect, beforeEach } from "vitest";

import { buildServices, makeContext, VALID_CPF_1 } from "./test-helpers.js";

describe("ClinicalRecordService versionamento", () => {
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

  it("cria entrada na versao 1", async () => {
    const record = await env.records.createEntry(actor, {
      patientId,
      entryType: "evolution",
      content: "Primeira consulta.",
    });
    expect(record.version).toBe(1);
    expect(record.supersededByVersion).toBeNull();
  });

  it("correcao cria nova versao e preserva o historico", async () => {
    const v1 = await env.records.createEntry(actor, {
      patientId,
      entryType: "evolution",
      content: "Texto original.",
    });
    const v2 = await env.records.correctEntry(actor, v1.recordKey, "Texto corrigido.");

    expect(v2.version).toBe(2);
    expect(v2.content).toBe("Texto corrigido.");

    // Historico preservado: as duas versoes existem.
    const history = await env.records.history(actor, v1.recordKey);
    expect(history.map((r) => r.version)).toEqual([1, 2]);
    expect(history[0]!.content).toBe("Texto original.");
    expect(history[0]!.supersededByVersion).toBe(2);

    // A listagem atual mostra apenas a versao vigente.
    const current = await env.records.listForPatient(actor, patientId);
    expect(current).toHaveLength(1);
    expect(current[0]!.version).toBe(2);
  });

  it("registra auditoria de criacao e correcao", async () => {
    const v1 = await env.records.createEntry(actor, {
      patientId,
      entryType: "evolution",
      content: "A",
    });
    await env.records.correctEntry(actor, v1.recordKey, "B");
    const actions = env.auditRepo.entries.map((e) => e.action);
    expect(actions).toContain("clinical_record.created");
    expect(actions).toContain("clinical_record.corrected");
  });
});
