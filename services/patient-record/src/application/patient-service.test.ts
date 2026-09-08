import { describe, it, expect, beforeEach } from "vitest";

import {
  ConflictError,
  ForbiddenError,
  NotFoundError,
  ValidationError,
} from "../domain/errors.js";
import {
  buildServices,
  makeContext,
  TENANT_A,
  TENANT_B,
  VALID_CPF_1,
} from "./test-helpers.js";

describe("PatientService.register", () => {
  let env: ReturnType<typeof buildServices>;
  beforeEach(() => {
    env = buildServices();
  });

  it("cadastra paciente com CPF valido e audita", async () => {
    const patient = await env.patients.register(makeContext(), {
      fullName: "Maria Silva",
      cpf: VALID_CPF_1,
    });
    expect(patient.cpf).toBe("52998224725"); // normalizado
    expect(env.auditRepo.entries.some((e) => e.action === "patient.registered")).toBe(
      true,
    );
  });

  it("rejeita CPF invalido", async () => {
    await expect(
      env.patients.register(makeContext(), { fullName: "X", cpf: "111.111.111-11" }),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it("impede CPF duplicado no mesmo tenant", async () => {
    await env.patients.register(makeContext(), { fullName: "Maria", cpf: VALID_CPF_1 });
    await expect(
      env.patients.register(makeContext(), { fullName: "Outra", cpf: VALID_CPF_1 }),
    ).rejects.toBeInstanceOf(ConflictError);
  });

  it("papel patient nao pode cadastrar (autorizacao nega)", async () => {
    await expect(
      env.patients.register(makeContext({ roles: ["patient"] }), {
        fullName: "X",
        cpf: VALID_CPF_1,
      }),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });
});

describe("PatientService isolamento por tenant", () => {
  it("nao acessa paciente de outro tenant", async () => {
    const env = buildServices();
    const patient = await env.patients.register(makeContext({ tenantId: TENANT_A }), {
      fullName: "Maria",
      cpf: VALID_CPF_1,
    });
    // Ator do tenant B tenta ler paciente do tenant A.
    await expect(
      env.patients.getById(makeContext({ tenantId: TENANT_B }), patient.id),
    ).rejects.toBeInstanceOf(NotFoundError);
  });
});
