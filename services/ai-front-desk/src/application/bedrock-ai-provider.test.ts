import { describe, it, expect } from "vitest";

import type { BedrockRuntimeClient } from "@aws-sdk/client-bedrock-runtime";

import { BedrockAIProvider } from "./bedrock-ai-provider.js";

/**
 * Cliente Bedrock falso: captura o ultimo comando enviado e devolve uma saida
 * determinística no formato do Converse. Nenhuma chamada real a AWS.
 */
interface SentCommand {
  readonly input: {
    readonly modelId?: string;
    readonly system?: ReadonlyArray<{ text?: string }>;
    readonly messages?: unknown;
    readonly inferenceConfig?: { maxTokens?: number; temperature?: number };
  };
}

function makeClient(replyText: string | (() => never)): {
  send: (command: unknown) => Promise<unknown>;
  last: () => SentCommand;
} {
  let lastCommand: SentCommand | undefined;
  return {
    last: () => {
      if (!lastCommand) throw new Error("nenhum comando enviado");
      return lastCommand;
    },
    async send(command: unknown): Promise<unknown> {
      lastCommand = command as SentCommand;
      if (typeof replyText === "function") {
        replyText();
      }
      return {
        output: {
          message: { role: "assistant", content: [{ text: replyText as string }] },
        },
      };
    },
  };
}

function providerWith(client: { send: (c: unknown) => Promise<unknown> }) {
  // O provider so usa client.send; o cast estreita o mock ao tipo esperado.
  return new BedrockAIProvider({
    client: client as unknown as BedrockRuntimeClient,
    modelId: "test-model",
  });
}

describe("BedrockAIProvider.reply", () => {
  it("extrai o texto da resposta do Converse", async () => {
    const client = makeClient("Ola! Posso ajudar com agendamento.");
    const provider = providerWith(client);

    const text = await provider.reply("Quero marcar consulta");

    expect(text).toBe("Ola! Posso ajudar com agendamento.");
  });

  it("envia maxTokens explicito e o system prompt de recepcao", async () => {
    const client = makeClient("ok");
    const provider = providerWith(client);

    await provider.reply("oi");

    const input = client.last().input;
    expect(input.modelId).toBe("test-model");
    expect(input.inferenceConfig?.maxTokens).toBe(1024);
    expect(input.system?.[0]?.text).toContain("atendimento virtual");
    // Reforca o carater nao clinico no prompt.
    expect(input.system?.[0]?.text).toContain("NAO fornece diagnostico");
  });

  it("retorna mensagem segura quando o modelo devolve texto vazio", async () => {
    const client = makeClient("   ");
    const provider = providerWith(client);

    const text = await provider.reply("oi");

    expect(text.length).toBeGreaterThan(0);
    expect(text).toContain("profissional da clinica");
  });
});

describe("BedrockAIProvider.triage", () => {
  it("parseia JSON de triagem valido", async () => {
    const client = makeClient(
      '{"reason":"quer remarcar","perceivedUrgency":"low","recommendHandoff":false}',
    );
    const provider = providerWith(client);

    const result = await provider.triage("preciso remarcar minha consulta");

    expect(result.reason).toBe("quer remarcar");
    expect(result.perceivedUrgency).toBe("low");
    expect(result.recommendHandoff).toBe(false);
  });

  it("isola JSON mesmo com texto ao redor", async () => {
    const client = makeClient(
      'Claro: {"reason":"duvida","perceivedUrgency":"medium","recommendHandoff":true} pronto',
    );
    const provider = providerWith(client);

    const result = await provider.triage("tenho uma duvida");

    expect(result.perceivedUrgency).toBe("medium");
    expect(result.recommendHandoff).toBe(true);
  });

  it("fallback conservador quando o parse falha (recomenda handoff)", async () => {
    const client = makeClient("nao e json nenhum");
    const provider = providerWith(client);

    const result = await provider.triage("estou com muita dor");

    expect(result.recommendHandoff).toBe(true);
    expect(result.perceivedUrgency).toBe("medium");
    expect(result.reason).toContain("muita dor");
  });

  it("forca handoff quando urgencia alta, mesmo com recommendHandoff false", async () => {
    const client = makeClient(
      '{"reason":"dor forte","perceivedUrgency":"high","recommendHandoff":false}',
    );
    const provider = providerWith(client);

    const result = await provider.triage("dor forte");

    expect(result.perceivedUrgency).toBe("high");
    expect(result.recommendHandoff).toBe(true);
  });

  it("fallback conservador quando o cliente lanca erro", async () => {
    const client = {
      send: async (): Promise<unknown> => {
        throw new Error("ThrottlingException");
      },
    };
    const provider = providerWith(client);

    const result = await provider.triage("qualquer coisa");

    expect(result.recommendHandoff).toBe(true);
  });

  it("usa temperature 0 e maxTokens explicito na triagem", async () => {
    const client = makeClient(
      '{"reason":"x","perceivedUrgency":"low","recommendHandoff":false}',
    );
    const provider = providerWith(client);

    await provider.triage("texto");

    const input = client.last().input;
    expect(input.inferenceConfig?.maxTokens).toBe(1024);
    expect(input.inferenceConfig?.temperature).toBe(0);
  });
});
