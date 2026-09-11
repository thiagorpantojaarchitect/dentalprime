import { describe, it, expect, vi } from "vitest";

import { ApiClient, ApiError } from "./api-client.js";

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

describe("ApiClient", () => {
  it("injeta o Bearer token em rotas autenticadas", async () => {
    const fetchImpl = vi.fn(async () => jsonResponse(200, { ok: true }));
    const client = new ApiClient({
      baseUrl: "http://api",
      getAccessToken: () => "token-abc",
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    await client.request("/x");
    const init = (fetchImpl.mock.calls[0] as unknown as [string, RequestInit])[1];
    const headers = init.headers as Record<string, string>;
    expect(headers["authorization"]).toBe("Bearer token-abc");
  });

  it("nao envia Authorization em rota publica", async () => {
    const fetchImpl = vi.fn(async () => jsonResponse(200, { ok: true }));
    const client = new ApiClient({
      baseUrl: "http://api",
      getAccessToken: () => "token-abc",
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    await client.request("/auth/login", { method: "POST", public: true });
    const init = (fetchImpl.mock.calls[0] as unknown as [string, RequestInit])[1];
    const headers = init.headers as Record<string, string>;
    expect(headers["authorization"]).toBeUndefined();
  });

  it("renova o token uma vez em 401 e repete", async () => {
    let call = 0;
    const fetchImpl = vi.fn(async () => {
      call += 1;
      return call === 1 ? jsonResponse(401, {}) : jsonResponse(200, { ok: true });
    });
    const refresh = vi.fn(async () => "novo-token");
    const client = new ApiClient({
      baseUrl: "http://api",
      getAccessToken: () => "expirado",
      refresh,
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    const result = await client.request<{ ok: boolean }>("/x");
    expect(result.ok).toBe(true);
    expect(refresh).toHaveBeenCalledTimes(1);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it("lanca ApiError com o codigo do backend", async () => {
    const fetchImpl = vi.fn(async () =>
      jsonResponse(409, { error: { code: "CONFLICT", message: "duplicado" } }),
    );
    const client = new ApiClient({
      baseUrl: "http://api",
      getAccessToken: () => "t",
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    await expect(client.request("/x")).rejects.toMatchObject({
      status: 409,
      code: "CONFLICT",
    });
  });

  it("retorna undefined em 204", async () => {
    const fetchImpl = vi.fn(async () => new Response(null, { status: 204 }));
    const client = new ApiClient({
      baseUrl: "http://api",
      getAccessToken: () => "t",
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    const result = await client.request<void>("/x", { method: "POST" });
    expect(result).toBeUndefined();
  });

  it("ApiError expoe status, code e name", () => {
    const err = new ApiError(403, "FORBIDDEN", "negado");
    expect(err.status).toBe(403);
    expect(err.code).toBe("FORBIDDEN");
    expect(err.name).toBe("ApiError");
  });
});
