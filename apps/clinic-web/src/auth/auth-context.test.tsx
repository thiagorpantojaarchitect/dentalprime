import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

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
});
