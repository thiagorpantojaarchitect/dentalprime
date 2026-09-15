import { describe, expect, it } from "vitest";

import { loadConfig } from "./config.js";

const base = {
  NODE_ENV: "test",
  DEPLOYMENT_ENV: "development",
  AI_PROVIDER: "stub",
  DATABASE_URL: "postgres://localhost:5432/dentalprime",
  JWT_SECRET: "x".repeat(32),
};

describe("ai-front-desk config", () => {
  it("requires guardrail ID and immutable version together", () => {
    expect(() => loadConfig({ ...base, BEDROCK_GUARDRAIL_ID: "guardrail-1" })).toThrow(
      "bedrockGuardrailId",
    );
    expect(
      loadConfig({
        ...base,
        BEDROCK_GUARDRAIL_ID: "guardrail-1",
        BEDROCK_GUARDRAIL_VERSION: "2",
      }).bedrockGuardrailVersion,
    ).toBe("2");
  });

  it("requires a model for Bedrock and rejects stub outside development", () => {
    expect(() => loadConfig({ ...base, AI_PROVIDER: "bedrock" })).toThrow(
      "bedrockModelId",
    );
    expect(() =>
      loadConfig({ ...base, DEPLOYMENT_ENV: "production", AI_PROVIDER: "stub" }),
    ).toThrow("aiProvider");
    expect(
      loadConfig({
        ...base,
        DEPLOYMENT_ENV: "production",
        AI_PROVIDER: "bedrock",
        BEDROCK_MODEL_ID: "model-1",
      }).aiProvider,
    ).toBe("bedrock");
  });
});
