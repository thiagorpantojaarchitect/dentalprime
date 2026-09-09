import { describe, it, expect, vi } from "vitest";

import { ApiClient, ApiError } from "./client.js";

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

describe("ApiClient", () => {
  it("injeta o Bearer token em rota autenticada", async () => {
    const fetchImpl = vi.fn(async () => jsonResponse(200, { ok: true }));
    const client = new ApiClient({
      baseUrl: "http://x",
      getAccessToken: () => "token-abc",
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    await client.request("/recurso");

    const init = (fetchImpl.mock.calls[0] as unknown as [string, RequestInit])[1];
    const headers = init.headers as Record<string, string>;
    expect(headers["authorization"]).toBe("Bearer token-abc");
  });

  it("nao envia Authorization em rota publica", async () => {
    const fetchImpl = vi.fn(async () => jsonResponse(200, {}));
    const client = new ApiClient({
      baseUrl: "http://x",
      getAccessToken: () => "token-abc",
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    await client.request("/auth/login", { method: "POST", body: {}, public: true });

    const init = (fetchImpl.mock.calls[0] as unknown as [string, RequestInit])[1];
    const headers = init.headers as Record<string, string>;
    expect(headers["authorization"]).toBeUndefined();
  });

  it("renova o token uma vez em 401 e repete a requisicao", async () => {
    let call = 0;
    const fetchImpl = vi.fn(async () => {
      call += 1;
      return call === 1
        ? jsonResponse(401, { error: { code: "UNAUTHENTICATED" } })
        : jsonResponse(200, { ok: true });
    });
    const refresh = vi.fn(async () => "novo-token");
    const client = new ApiClient({
      baseUrl: "http://x",
      getAccessToken: () => "expirado",
      refresh,
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    const result = await client.request<{ ok: boolean }>("/recurso");
    expect(result.ok).toBe(true);
    expect(refresh).toHaveBeenCalledTimes(1);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it("lanca ApiError com codigo do backend em erro", async () => {
    const fetchImpl = vi.fn(async () =>
      jsonResponse(409, { error: { code: "CONFLICT", message: "duplicado" } }),
    );
    const client = new ApiClient({
      baseUrl: "http://x",
      getAccessToken: () => "t",
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    await expect(
      client.request("/x", { method: "POST", body: {} }),
    ).rejects.toMatchObject({
      name: "ApiError",
      status: 409,
      code: "CONFLICT",
    });
  });

  it("204 retorna undefined", async () => {
    const fetchImpl = vi.fn(async () => new Response(null, { status: 204 }));
    const client = new ApiClient({
      baseUrl: "http://x",
      getAccessToken: () => "t",
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    const result = await client.request("/x", { method: "DELETE" });
    expect(result).toBeUndefined();
  });
});

describe("ApiError", () => {
  it("carrega status, code e message", () => {
    const err = new ApiError(400, "VALIDATION", "invalido");
    expect(err.status).toBe(400);
    expect(err.code).toBe("VALIDATION");
    expect(err.message).toBe("invalido");
  });
});
