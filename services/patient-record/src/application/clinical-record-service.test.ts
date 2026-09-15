import { describe, it, expect, beforeEach } from "vitest";

import { ForbiddenError, NotFoundError } from "../domain/errors.js";
import { buildServices, makeContext, VALID_CPF_1 } from "./test-helpers.js";

const PORTAL_USER_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

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

  it("patient vinculado le somente o proprio prontuario pela operacao self", async () => {
    await env.records.createEntry(actor, {
      patientId,
      entryType: "evolution",
      content: "Registro do proprio paciente.",
    });
    await env.patients.linkPortalUser(actor, patientId, PORTAL_USER_ID);
    const portalActor = makeContext({ userId: PORTAL_USER_ID, roles: ["patient"] });

    await expect(env.records.listForSelf(portalActor)).resolves.toHaveLength(1);
    await expect(
      env.records.listForPatient(portalActor, patientId),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("nao libera prontuario sem vinculo explicito", async () => {
    await expect(
      env.records.listForSelf(
        makeContext({ userId: PORTAL_USER_ID, roles: ["patient"] }),
      ),
    ).rejects.toBeInstanceOf(NotFoundError);
  });
});
