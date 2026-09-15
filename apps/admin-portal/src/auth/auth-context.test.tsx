import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";

import { MemoryStorage, jsonResponse } from "../test/helpers.js";
import { AuthProvider, useAuth } from "./auth-context.js";
import { SessionStore } from "./session-store.js";

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

describe("AuthProvider (admin-portal)", () => {
  it("compartilha uma unica renovacao entre requisicoes 401 concorrentes", async () => {
    const store = new SessionStore(new MemoryStorage());
    store.save({
      tenantId: "clinic-9",
      email: "admin@example.com",
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
