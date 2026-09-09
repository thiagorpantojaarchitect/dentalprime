import { describe, it, expect, beforeEach } from "vitest";

import { ForbiddenError, NotFoundError, ValidationError } from "../domain/errors.js";
import { buildEnv, makeContext, TENANT_B } from "./test-helpers.js";

const actor = makeContext();
const PATIENT = "77777777-7777-7777-7777-777777777777";

describe("LeadService", () => {
  let env: ReturnType<typeof buildEnv>;
  beforeEach(() => {
    env = buildEnv();
  });

  it("cadastra lead com status new e audita", async () => {
    const lead = await env.leads.create(actor, { name: "Joao", phone: "119999" });
    expect(lead.status).toBe("new");
    expect(env.auditRepo.entries.some((e) => e.action === "lead.created")).toBe(true);
  });

  it("segue transicoes validas e converte vinculando ao paciente", async () => {
    const lead = await env.leads.create(actor, { name: "Joao" });
    await env.leads.changeStatus(actor, lead.id, "contacted");
    await env.leads.changeStatus(actor, lead.id, "qualified");
    const converted = await env.leads.convert(actor, lead.id, PATIENT);
    expect(converted.status).toBe("converted");
    expect(converted.patientId).toBe(PATIENT);
  });

  it("rejeita transicao invalida (new -> qualified)", async () => {
    const lead = await env.leads.create(actor, { name: "Joao" });
    await expect(
      env.leads.changeStatus(actor, lead.id, "qualified"),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it("papel patient nao pode criar lead", async () => {
    await expect(
      env.leads.create(makeContext({ roles: ["patient"] }), { name: "X" }),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("isolamento: outro tenant nao acessa o lead", async () => {
    const lead = await env.leads.create(actor, { name: "Joao" });
    await expect(
      env.leads.changeStatus(makeContext({ tenantId: TENANT_B }), lead.id, "contacted"),
    ).rejects.toBeInstanceOf(NotFoundError);
  });
});
