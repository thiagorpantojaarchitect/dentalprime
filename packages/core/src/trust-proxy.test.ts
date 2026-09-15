import { describe, expect, it } from "vitest";

import { trustProxyForHops } from "./trust-proxy.js";

describe("trustProxyForHops", () => {
  it("confia somente socket e o numero exato de proxies configurado", () => {
    const trust = trustProxyForHops(2);
    if (trust === false) throw new Error("trust proxy deveria estar ativo");
    expect(trust("10.0.0.1", 0)).toBe(true);
    expect(trust("192.0.2.1", 1)).toBe(true);
    expect(trust("198.51.100.10", 2)).toBe(false);
  });

  it("desabilita proxy com zero e rejeita configuracao ampla", () => {
    expect(trustProxyForHops(0)).toBe(false);
    expect(() => trustProxyForHops(3)).toThrow("hop count");
  });
});
