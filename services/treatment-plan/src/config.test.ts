import { describe, expect, it } from "vitest";

import { loadConfig } from "./config.js";

const required = {
  DATABASE_URL: "postgres://localhost/dentalprime",
  JWT_SECRET: "test-secret-com-pelo-menos-32-caracteres!!",
};

describe("treatment-plan event configuration", () => {
  it("usa noop somente como padrao local de development", () => {
    expect(loadConfig(required).eventProvider).toBe("noop");
  });

  it("seleciona EventBridge quando um bus e informado", () => {
    expect(
      loadConfig({ ...required, EVENT_BUS_NAME: "dentalprime-dev" }).eventProvider,
    ).toBe("eventbridge");
  });

  it("falha fechado fora de development sem EventBridge configurado", () => {
    expect(() => loadConfig({ ...required, DEPLOYMENT_ENV: "staging" })).toThrow(
      "eventBusName",
    );
    expect(() =>
      loadConfig({
        ...required,
        NODE_ENV: "production",
        DEPLOYMENT_ENV: "production",
        TRUST_PROXY: "2",
        EVENT_PROVIDER: "noop",
      }),
    ).toThrow("eventProvider");
  });
});
