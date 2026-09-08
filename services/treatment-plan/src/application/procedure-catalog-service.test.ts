import { describe, it, expect, beforeEach } from "vitest";

import {
  ConflictError,
  ForbiddenError,
  LicensedCodeBlockedError,
  ValidationError,
} from "../domain/errors.js";
import { buildEnv, makeContext } from "./test-helpers.js";

const actor = makeContext({ roles: ["manager"] });

describe("ProcedureCatalogService", () => {
  let env: ReturnType<typeof buildEnv>;
  beforeEach(() => {
    env = buildEnv();
  });

  it("cadastra procedimento proprio com custo valido", async () => {
    const proc = await env.procedures.create(actor, {
      name: "Limpeza",
      baseCost: "150.00",
    });
    expect(proc.name).toBe("Limpeza");
    expect(env.auditRepo.entries.some((e) => e.action === "procedure.created")).toBe(
      true,
    );
  });

  it("bloqueia codigo licenciado sem acordo", async () => {
    await expect(
      env.procedures.create(actor, {
        name: "Restauracao",
        baseCost: "200.00",
        licensedCode: "D2140",
      }),
    ).rejects.toBeInstanceOf(LicensedCodeBlockedError);
  });

  it("rejeita custo invalido", async () => {
    await expect(
      env.procedures.create(actor, { name: "X", baseCost: "12.999" }),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it("impede nome duplicado no tenant", async () => {
    await env.procedures.create(actor, { name: "Canal", baseCost: "800.00" });
    await expect(
      env.procedures.create(actor, { name: "Canal", baseCost: "900.00" }),
    ).rejects.toBeInstanceOf(ConflictError);
  });

  it("papel patient nao pode criar procedimento", async () => {
    await expect(
      env.procedures.create(makeContext({ roles: ["patient"] }), {
        name: "Y",
        baseCost: "100.00",
      }),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });
});
