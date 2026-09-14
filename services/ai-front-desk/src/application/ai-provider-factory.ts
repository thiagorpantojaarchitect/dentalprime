/**
 * Fabrica do provedor de IA. Seleciona o adaptador conforme a configuracao e faz
 * fallback seguro para o stub deterministico caso a inicializacao do adaptador
 * real falhe (ex.: SDK indisponivel ou config incompleta). O objetivo e nunca
 * derrubar o servico por causa da camada de IA: na duvida, degrada para stub.
 *
 * Ver `.kiro/steering/product-vision.md` (IA plugavel e substituivel).
 */

import type { Config } from "../config.js";
import { StubAIProvider, type AIProvider } from "./ai-provider.js";
import { BedrockAIProvider, createBedrockClient } from "./bedrock-ai-provider.js";

/**
 * Cria o AIProvider a partir da configuracao.
 * - "stub": provedor deterministico (dev/teste).
 * - "bedrock": adaptador Amazon Bedrock; requer bedrockModelId. Se faltar config
 *   ou a init falhar, faz fallback para o stub sem interromper o servico.
 */
export function createAIProvider(config: Config): AIProvider {
  if (config.aiProvider === "bedrock") {
    try {
      if (!config.bedrockModelId) {
        // Sem modelo configurado nao ha como usar o Bedrock; degrada com aviso.
        console.warn(
          "[ai-front-desk] AI_PROVIDER=bedrock sem BEDROCK_MODEL_ID; usando stub.",
        );
        return new StubAIProvider();
      }
      const client = createBedrockClient(config.bedrockRegion);
      return new BedrockAIProvider({ client, modelId: config.bedrockModelId });
    } catch (error) {
      // Nao vaza detalhes sensiveis; registra apenas o nome do erro.
      const name = error instanceof Error ? error.name : "UnknownError";
      console.warn(
        `[ai-front-desk] Falha ao iniciar provider Bedrock (${name}); usando stub.`,
      );
      return new StubAIProvider();
    }
  }
  return new StubAIProvider();
}
