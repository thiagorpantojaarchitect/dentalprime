import { describe, it, expect, beforeEach } from "vitest";

import { ForbiddenError } from "../domain/errors.js";
import { buildEnv, makeContext } from "./test-helpers.js";

const actor = makeContext();

describe("DashboardService.leadFunnel", () => {
  let env: ReturnType<typeof buildEnv>;

  beforeEach(() => {
    env = buildEnv();
  });

  it("tenant sem leads: funil zerado e taxa nula", async () => {
    const dash = await env.dashboard.leadFunnel(actor);
    expect(dash.totalLeads).toBe(0);
    expect(dash.conversionRate).toBeNull();
    expect(dash.funnel.map((b) => b.status)).toEqual([
      "new",
      "contacted",
      "qualified",
      "converted",
      "lost",
    ]);
    expect(dash.funnel.every((b) => b.count === 0)).toBe(true);
  });

  it("agrega leads por status e calcula a taxa de conversao", async () => {
    // 4 leads: 1 convertido, 1 perdido, 1 contatado, 1 novo.
    const l1 = await env.leads.create(actor, { name: "Lead 1" });
    const l2 = await env.leads.create(actor, { name: "Lead 2" });
    const l3 = await env.leads.create(actor, { name: "Lead 3" });
    await env.leads.create(actor, { name: "Lead 4" }); // permanece "new"

    // l1: new -> contacted -> qualified -> converted.
    await env.leads.changeStatus(actor, l1.id, "contacted");
    await env.leads.changeStatus(actor, l1.id, "qualified");
    await env.leads.convert(actor, l1.id, "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa");
    // l2: new -> lost.
    await env.leads.changeStatus(actor, l2.id, "lost");
    // l3: new -> contacted.
    await env.leads.changeStatus(actor, l3.id, "contacted");

    const dash = await env.dashboard.leadFunnel(actor);

    expect(dash.totalLeads).toBe(4);
    const find = (s: string): number =>
      dash.funnel.find((b) => b.status === s)?.count ?? 0;
    expect(find("new")).toBe(1);
    expect(find("contacted")).toBe(1);
    expect(find("converted")).toBe(1);
    expect(find("lost")).toBe(1);
    // 1 convertido de 4 leads = 0.25.
    expect(dash.conversionRate).toBeCloseTo(0.25, 5);
  });

  it("registra auditoria de visualizacao do painel", async () => {
    await env.dashboard.leadFunnel(actor);
    expect(env.auditRepo.entries.some((e) => e.action === "crm.dashboard_viewed")).toBe(
      true,
    );
  });

  it("papel sem crm:read nao acessa o painel", async () => {
    await expect(
      env.dashboard.leadFunnel(makeContext({ roles: ["patient"] })),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });
});
