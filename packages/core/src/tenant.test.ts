import { describe, it, expect } from "vitest";
import { hasUnitAccess, hasAnyRole, type TenantContext } from "./tenant.js";

const context: TenantContext = {
  tenantId: "tenant-001",
  userId: "user-001",
  roles: ["dentist"],
  units: ["unit-a", "unit-b"],
};

describe("hasUnitAccess", () => {
  it("retorna true para unidade acessivel", () => {
    expect(hasUnitAccess(context, "unit-a")).toBe(true);
  });

  it("retorna false para unidade nao acessivel", () => {
    expect(hasUnitAccess(context, "unit-c")).toBe(false);
  });
});

describe("hasAnyRole", () => {
  it("retorna true quando ha interseccao de papeis", () => {
    expect(hasAnyRole(context, ["manager", "dentist"])).toBe(true);
  });

  it("retorna false quando nao ha interseccao", () => {
    expect(hasAnyRole(context, ["owner", "front-desk"])).toBe(false);
  });
});
