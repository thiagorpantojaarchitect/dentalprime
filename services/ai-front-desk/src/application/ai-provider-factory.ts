/**
 * Fabrica do provedor de IA. Usa o stub somente quando ele foi explicitamente
 * selecionado para development. Uma selecao de Bedrock falha de forma visivel
 * se estiver incompleta; nunca degrada silenciosamente para outro provedor.
 *
 * Ver `.kiro/steering/product-vision.md` (IA plugavel e substituivel).
 */

import type { Config } from "../config.js";
import { StubAIProvider, type AIProvider } from "./ai-provider.js";
import { BedrockAIProvider, createBedrockClient } from "./bedrock-ai-provider.js";

/**
 * Cria o AIProvider a partir da configuracao.
 * - "stub": provedor deterministico (dev/teste).
 * - "bedrock": adaptador Amazon Bedrock; requer bedrockModelId e falha fechado.
 */
export function createAIProvider(config: Config): AIProvider {
  if (config.aiProvider === "stub") {
    return new StubAIProvider();
  }

  if (!config.bedrockModelId) {
    throw new Error("BEDROCK_MODEL_ID is required when AI_PROVIDER=bedrock.");
  }
  const client = createBedrockClient(config.bedrockRegion);
  return new BedrockAIProvider({
    client,
    modelId: config.bedrockModelId,
    maxTokens: config.bedrockMaxTokens,
    ...(config.bedrockGuardrailId && config.bedrockGuardrailVersion
      ? {
          guardrailId: config.bedrockGuardrailId,
          guardrailVersion: config.bedrockGuardrailVersion,
        }
      : {}),
  });
}
