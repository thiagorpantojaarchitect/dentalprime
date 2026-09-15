import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";

import { AuthProvider, useAuth } from "./auth-context.js";
import { SessionStore, type SessionStorageLike } from "./session-store.js";

class MemoryStorage implements SessionStorageLike {
  private readonly map = new Map<string, string>();
  getItem(key: string): string | null {
    return this.map.get(key) ?? null;
  }
  setItem(key: string, value: string): void {
    this.map.set(key, value);
  }
  removeItem(key: string): void {
    this.map.delete(key);
  }
}

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function Harness(): JSX.Element {
  const { isAuthenticated, session, login, logout } = useAuth();
  return (
    <div>
      <span data-testid="status">{isAuthenticated ? "in" : "out"}</span>
      <span data-testid="email">{session?.email ?? ""}</span>
      <button onClick={() => void login("clinic-1", "user@example.com", "secret")}>
        entrar
      </button>
      <button onClick={() => void logout()}>sair</button>
    </div>
  );
}

function ConcurrentRefreshHarness(): JSX.Element {
  const { clientFor } = useAuth();
  const [status, setStatus] = useState("idle");

  const run = async (): Promise<void> => {
    const client = clientFor("http://service");
    await Promise.all([
      client.request("/one"),
      client.request("/two"),
      client.request("/three"),
    ]);
    setStatus("done");
  };

  return (
    <div>
      <span data-testid="refresh-status">{status}</span>
      <button onClick={() => void run()}>consultar em paralelo</button>
    </div>
  );
}

describe("AuthProvider", () => {
  let storage: MemoryStorage;
  let store: SessionStore;

  beforeEach(() => {
    storage = new MemoryStorage();
    store = new SessionStore(storage);
  });

  it("comeca deslogado quando nao ha sessao no storage", () => {
    const fetchImpl = vi.fn();
    render(
      <AuthProvider
        identityUrl="http://id"
        store={store}
        fetchImpl={fetchImpl as unknown as typeof fetch}
      >
        <Harness />
      </AuthProvider>,
    );
    expect(screen.getByTestId("status")).toHaveTextContent("out");
  });

  it("login autentica e persiste a sessao", async () => {
    const fetchImpl = vi.fn(async () =>
      jsonResponse(200, { accessToken: "acc-1", refreshToken: "ref-1" }),
    );
    render(
      <AuthProvider
        identityUrl="http://id"
        store={store}
        fetchImpl={fetchImpl as unknown as typeof fetch}
      >
        <Harness />
      </AuthProvider>,
    );

    await userEvent.click(screen.getByText("entrar"));

    await waitFor(() => expect(screen.getByTestId("status")).toHaveTextContent("in"));
    expect(screen.getByTestId("email")).toHaveTextContent("user@example.com");
    expect(store.load()).toMatchObject({ tenantId: "clinic-1", accessToken: "acc-1" });
  });

  it("logout encerra a sessao local mesmo se o logout remoto falhar", async () => {
    let call = 0;
    const fetchImpl = vi.fn(async () => {
      call += 1;
      // 1a chamada: login OK. 2a chamada: logout falha (500).
      return call === 1
        ? jsonResponse(200, { accessToken: "acc-1", refreshToken: "ref-1" })
        : jsonResponse(500, { error: { code: "INTERNAL" } });
    });
    render(
      <AuthProvider
        identityUrl="http://id"
        store={store}
        fetchImpl={fetchImpl as unknown as typeof fetch}
      >
        <Harness />
      </AuthProvider>,
    );

    await userEvent.click(screen.getByText("entrar"));
    await waitFor(() => expect(screen.getByTestId("status")).toHaveTextContent("in"));

    await userEvent.click(screen.getByText("sair"));
    await waitFor(() => expect(screen.getByTestId("status")).toHaveTextContent("out"));
    expect(store.load()).toBeNull();
  });

  it("carrega sessao existente do storage ao montar", () => {
    store.save({
      tenantId: "clinic-9",
      email: "prev@example.com",
      accessToken: "a",
      refreshToken: "r",
    });
    const fetchImpl = vi.fn();
    render(
      <AuthProvider
        identityUrl="http://id"
        store={store}
        fetchImpl={fetchImpl as unknown as typeof fetch}
      >
        <Harness />
      </AuthProvider>,
    );
    expect(screen.getByTestId("status")).toHaveTextContent("in");
    expect(screen.getByTestId("email")).toHaveTextContent("prev@example.com");
  });

  it("compartilha uma unica renovacao entre requisicoes 401 concorrentes", async () => {
    store.save({
      tenantId: "clinic-9",
      email: "prev@example.com",
      accessToken: "access-old",
      refreshToken: "refresh-old",
    });
    let refreshCalls = 0;
    const fetchImpl = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url === "http://id/auth/refresh") {
        refreshCalls += 1;
        await Promise.resolve();
        return jsonResponse(200, {
          accessToken: "access-new",
          refreshToken: "refresh-new",
        });
      }
      const headers = init?.headers as Record<string, string> | undefined;
      return headers?.authorization === "Bearer access-new"
        ? jsonResponse(200, { ok: true })
        : jsonResponse(401, { error: { code: "TOKEN_EXPIRED" } });
    });

    render(
      <AuthProvider identityUrl="http://id" store={store} fetchImpl={fetchImpl}>
        <ConcurrentRefreshHarness />
      </AuthProvider>,
    );

    await userEvent.click(screen.getByText("consultar em paralelo"));
    await waitFor(() =>
      expect(screen.getByTestId("refresh-status")).toHaveTextContent("done"),
    );
    expect(refreshCalls).toBe(1);
    expect(store.load()).toMatchObject({
      accessToken: "access-new",
      refreshToken: "refresh-new",
    });
  });
});
