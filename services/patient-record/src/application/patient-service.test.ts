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
  VALID_CPF_2,
} from "./test-helpers.js";

const PORTAL_USER_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

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

describe("PatientService acesso proprio pelo portal", () => {
  it("vincula por staff e permite ao patient ler apenas o proprio cadastro", async () => {
    const env = buildServices();
    const staff = makeContext();
    const patient = await env.patients.register(staff, {
      fullName: "Maria",
      cpf: VALID_CPF_1,
    });

    await env.patients.linkPortalUser(staff, patient.id, PORTAL_USER_ID);
    const portalActor = makeContext({ userId: PORTAL_USER_ID, roles: ["patient"] });
    await expect(env.patients.getOwnProfile(portalActor)).resolves.toMatchObject({
      id: patient.id,
      portalUserId: PORTAL_USER_ID,
    });

    await expect(env.patients.getById(portalActor, patient.id)).rejects.toBeInstanceOf(
      ForbiddenError,
    );
    expect(
      env.auditRepo.entries.some((entry) => entry.action === "patient.self_accessed"),
    ).toBe(true);
  });

  it("nao resolve o mesmo usuario em outro tenant", async () => {
    const env = buildServices();
    const staff = makeContext({ tenantId: TENANT_A });
    const patient = await env.patients.register(staff, {
      fullName: "Maria",
      cpf: VALID_CPF_1,
    });
    await env.patients.linkPortalUser(staff, patient.id, PORTAL_USER_ID);

    await expect(
      env.patients.getOwnProfile(
        makeContext({
          tenantId: TENANT_B,
          userId: PORTAL_USER_ID,
          roles: ["patient"],
        }),
      ),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it("impede que um usuario do portal seja vinculado a dois pacientes", async () => {
    const env = buildServices();
    const staff = makeContext();
    const first = await env.patients.register(staff, {
      fullName: "Maria",
      cpf: VALID_CPF_1,
    });
    const second = await env.patients.register(staff, {
      fullName: "Joana",
      cpf: VALID_CPF_2,
    });
    await env.patients.linkPortalUser(staff, first.id, PORTAL_USER_ID);

    await expect(
      env.patients.linkPortalUser(staff, second.id, PORTAL_USER_ID),
    ).rejects.toBeInstanceOf(ConflictError);
  });
});
