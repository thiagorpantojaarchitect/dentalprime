import { describe, it, expect, beforeEach } from "vitest";

import { buildEnv, makeContext, TENANT_B } from "./test-helpers.js";

const actor = makeContext();

describe("SchedulingSuggestionService (assistivo)", () => {
  let env: ReturnType<typeof buildEnv>;
  let conversationId: string;

  beforeEach(async () => {
    env = buildEnv();
    const conv = await env.conversations.start(actor, "chat", "contato-1");
    conversationId = conv.id;
  });

  it("sugestao de agendamento fica pendente de revisao (nao agenda sozinho)", async () => {
    const log = await env.suggestions.suggest(actor, {
      conversationId,
      suggestedSlots: ["2026-04-01T09:00:00Z", "2026-04-01T10:00:00Z"],
    });
    expect(log.actionType).toBe("scheduling_suggestion");
    expect(log.reviewStatus).toBe("pending");
  });

  it("revisao humana aprova a sugestao", async () => {
    const log = await env.suggestions.suggest(actor, {
      conversationId,
      suggestedSlots: ["2026-04-01T09:00:00Z"],
    });
    await env.suggestions.review(actor, log.id, "approved");
    const actions = await env.suggestions.listActions(actor, conversationId);
    expect(actions[0]!.reviewStatus).toBe("approved");
  });

  it("isolamento: outro tenant nao sugere em conversa alheia", async () => {
    await expect(
      env.suggestions.suggest(makeContext({ tenantId: TENANT_B }), {
        conversationId,
        suggestedSlots: ["2026-04-01T09:00:00Z"],
      }),
    ).rejects.toThrow();
  });
});

describe("HandoffService", () => {
  it("registra handoff e marca conversa para humano", async () => {
    const env = buildEnv();
    const conv = await env.conversations.start(actor, "chat", "c1");
    const handoff = await env.handoffs.requestHandoff(
      actor,
      conv.id,
      "cliente pediu atendente",
      "contact",
    );
    expect(handoff.reason).toBe("cliente pediu atendente");
    expect(env.auditRepo.entries.some((e) => e.action === "conversation.handoff")).toBe(
      true,
    );
  });
});
