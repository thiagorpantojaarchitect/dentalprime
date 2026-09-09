import { describe, it, expect, beforeEach } from "vitest";

import { ForbiddenError } from "../domain/errors.js";
import { buildEnv, makeContext } from "./test-helpers.js";

const actor = makeContext();

describe("ConversationService (IA assistiva)", () => {
  let env: ReturnType<typeof buildEnv>;
  let conversationId: string;

  beforeEach(async () => {
    env = buildEnv();
    const conv = await env.conversations.start(actor, "chat", "contato-1");
    conversationId = conv.id;
  });

  it("resposta da IA vem identificada (isAI)", async () => {
    const result = await env.conversations.handleContactMessage(
      actor,
      conversationId,
      "Quero marcar uma consulta",
    );
    expect(result.reply.isAI).toBe(true);
    expect(result.handedOff).toBe(false);
  });

  it("pedido de conteudo clinico e bloqueado e gera handoff", async () => {
    const result = await env.conversations.handleContactMessage(
      actor,
      conversationId,
      "Qual remedio devo tomar para dor de dente?",
    );
    expect(result.handedOff).toBe(true);
    expect(result.reply.isAI).toBe(true);
    // Um handoff foi criado, disparado pela IA (guardrail).
    expect(env.handoffRepo.rows.some((h) => h.triggeredBy === "ai")).toBe(true);
    expect(
      env.auditRepo.entries.some(
        (e) => e.action === "conversation.clinical_content_blocked",
      ),
    ).toBe(true);
  });

  it("triagem marca urgencia e recomenda handoff", async () => {
    const triage = await env.conversations.triage(actor, "Estou com muita dor, urgente!");
    expect(triage.perceivedUrgency).toBe("high");
    expect(triage.recommendHandoff).toBe(true);
  });

  it("papel patient nao pode operar a recepcao por IA", async () => {
    await expect(
      env.conversations.start(makeContext({ roles: ["patient"] }), "chat", null),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });
});
