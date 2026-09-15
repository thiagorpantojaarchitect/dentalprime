import { describe, expect, it } from "vitest";

import { ForbiddenError, ValidationError } from "../domain/errors.js";
import { buildEnv, makeContext, TENANT_A, UNIT_A } from "./test-helpers.js";

const UNIT_B = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";
const PROVIDER_USER = "33333333-3333-4333-8333-333333333333";

describe("AvailabilityService catalog", () => {
  it("cadastra e lista providers e resources no tenant/unidade", async () => {
    const env = buildEnv();
    const actor = makeContext();

    const provider = await env.availability.createProvider(actor, {
      unitId: UNIT_A,
      userId: PROVIDER_USER,
      displayName: "  Dra. Ana  ",
    });
    const resource = await env.availability.createResource(actor, {
      unitId: UNIT_A,
      name: "  Cadeira 1  ",
      kind: "  chair  ",
    });

    await env.availability.createProvider(makeContext({ tenantId: TENANT_A }), {
      unitId: UNIT_B,
      userId: "44444444-4444-4444-8444-444444444444",
      displayName: "Dr. Outra Unidade",
    });

    expect(await env.availability.listProviders(actor, UNIT_A)).toEqual([provider]);
    expect(await env.availability.listResources(actor, UNIT_A)).toEqual([resource]);
    expect(provider.displayName).toBe("Dra. Ana");
    expect(resource).toMatchObject({ name: "Cadeira 1", kind: "chair" });
    expect(env.auditRepo.entries.map((entry) => entry.action)).toEqual(
      expect.arrayContaining(["provider.created", "resource.created"]),
    );
  });

  it("nega cadastro e listagem fora das unidades do ator", async () => {
    const env = buildEnv();
    const actor = makeContext({ units: [UNIT_A] });

    await expect(
      env.availability.createResource(actor, {
        unitId: UNIT_B,
        name: "Sala B",
        kind: "room",
      }),
    ).rejects.toBeInstanceOf(ForbiddenError);
    await expect(env.availability.listProviders(actor, UNIT_B)).rejects.toBeInstanceOf(
      ForbiddenError,
    );
  });

  it("nega escrita a papel somente leitura e valida valores vazios", async () => {
    const env = buildEnv();
    await expect(
      env.availability.createProvider(makeContext({ roles: ["patient"] }), {
        unitId: UNIT_A,
        userId: PROVIDER_USER,
        displayName: "Dra. Ana",
      }),
    ).rejects.toBeInstanceOf(ForbiddenError);

    await expect(
      env.availability.createResource(makeContext(), {
        unitId: UNIT_A,
        name: "   ",
        kind: "chair",
      }),
    ).rejects.toBeInstanceOf(ValidationError);
  });
});
