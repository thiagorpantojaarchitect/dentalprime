import { describe, it, expect } from "vitest";

import type { Config } from "../config.js";
import { createAIProvider } from "./ai-provider-factory.js";
import { StubAIProvider } from "./ai-provider.js";
import { BedrockAIProvider } from "./bedrock-ai-provider.js";

function makeConfig(overrides: Partial<Config> = {}): Config {
  return {
    nodeEnv: "test",
    port: 3007,
    databaseUrl: "postgres://localhost:5432/test",
    jwtSecret: "x".repeat(32),
    aiProvider: "stub",
    bedrockRegion: "sa-east-1",
    ...overrides,
  };
}

describe("createAIProvider", () => {
  it("retorna StubAIProvider por padrao", () => {
    const provider = createAIProvider(makeConfig());
    expect(provider).toBeInstanceOf(StubAIProvider);
  });

  it("retorna BedrockAIProvider quando configurado com modelId", () => {
    const provider = createAIProvider(
      makeConfig({ aiProvider: "bedrock", bedrockModelId: "some-model" }),
    );
    expect(provider).toBeInstanceOf(BedrockAIProvider);
  });

  it("faz fallback para stub quando aiProvider=bedrock sem modelId", () => {
    const provider = createAIProvider(makeConfig({ aiProvider: "bedrock" }));
    expect(provider).toBeInstanceOf(StubAIProvider);
  });
});
