import { describe, expect, it } from "vitest";

import { loadConfig } from "./config.js";

const base = {
  DATABASE_URL: "postgres://localhost:5432/dentalprime",
  JWT_SECRET: "x".repeat(32),
};

describe("identity-access config", () => {
  it("uses in-memory rate limiting only outside production", () => {
    expect(loadConfig({ ...base, NODE_ENV: "development" }).redisUrl).toBeUndefined();
    expect(() => loadConfig({ ...base, NODE_ENV: "production" })).toThrow("redisUrl");
  });

  it("accepts a runtime-injected Redis URL and token in production", () => {
    const config = loadConfig({
      ...base,
      NODE_ENV: "production",
      REDIS_URL: "rediss://cache.example.invalid:6379",
      REDIS_AUTH_TOKEN: "runtime-secret-placeholder",
      TRUST_PROXY: "2",
    });
    expect(config.redisUrl).toContain("cache.example.invalid");
    expect(config.trustProxy).toBe(2);
  });

  it("requires TLS for the production Redis connection", () => {
    expect(() =>
      loadConfig({
        ...base,
        NODE_ENV: "production",
        REDIS_URL: "redis://cache.example.invalid:6379",
      }),
    ).toThrow("redisUrl");
  });

  it("rejeita confiar em toda a cadeia de proxies em producao", () => {
    expect(() =>
      loadConfig({
        ...base,
        NODE_ENV: "production",
        REDIS_URL: "rediss://cache.example.invalid:6379",
        TRUST_PROXY: "true",
      }),
    ).toThrow("trustProxy");
    expect(() =>
      loadConfig({
        ...base,
        NODE_ENV: "production",
        REDIS_URL: "rediss://cache.example.invalid:6379",
        TRUST_PROXY: "1",
      }),
    ).toThrow("trustProxy");
  });
});
