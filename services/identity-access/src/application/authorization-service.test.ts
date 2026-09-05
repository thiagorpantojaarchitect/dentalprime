import { describe, it, expect } from "vitest";
import type { TenantContext } from "@dentalprime/core";

import { AuthorizationService } from "./authorization-service.js";
import { ForbiddenError } from "../domain/errors.js";

const authorization = new AuthorizationService();

function ctx(overrides: Partial<TenantContext> = {}): TenantContext {
  return {
    tenantId: "tenant-1",
    userId: "user-1",
    roles: ["front-desk"],
    units: [],
    ...overrides,
  };
}

describe("AuthorizationService.can", () => {
  it("permite acao concedida pelo papel", () => {
    expect(authorization.can(ctx(), "appointment:manage", { tenantId: "tenant-1" })).toBe(
      true,
    );
  });

  it("nega acao nao concedida pelo papel", () => {
    // front-desk nao gerencia usuarios
    expect(authorization.can(ctx(), "user:manage", { tenantId: "tenant-1" })).toBe(false);
  });

  it("nega quando o tenant do recurso difere do contexto (isolamento)", () => {
    expect(
      authorization.can(ctx({ roles: ["owner"] }), "user:manage", {
        tenantId: "tenant-2",
      }),
    ).toBe(false);
  });

  it("owner tem acesso amplo dentro do proprio tenant", () => {
    const owner = ctx({ roles: ["owner"] });
    expect(authorization.can(owner, "user:manage", { tenantId: "tenant-1" })).toBe(true);
    expect(authorization.can(owner, "audit:read", { tenantId: "tenant-1" })).toBe(true);
  });

  it("respeita escopo de unidade quando o usuario tem unidades especificas", () => {
    const dentist = ctx({ roles: ["dentist"], units: ["unit-a"] });
    expect(
      authorization.can(dentist, "appointment:manage", {
        tenantId: "tenant-1",
        unitId: "unit-a",
      }),
    ).toBe(true);
    expect(
      authorization.can(dentist, "appointment:manage", {
        tenantId: "tenant-1",
        unitId: "unit-b",
      }),
    ).toBe(false);
  });

  it("ensure lanca ForbiddenError quando negado", () => {
    expect(() =>
      authorization.ensure(ctx(), "user:manage", { tenantId: "tenant-1" }),
    ).toThrow(ForbiddenError);
  });
});
