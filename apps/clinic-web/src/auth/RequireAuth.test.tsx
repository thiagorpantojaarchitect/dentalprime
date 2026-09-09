import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";

import { AuthProvider } from "./auth-context.js";
import { RequireAuth } from "./RequireAuth.js";
import { SessionStore, type Session, type SessionStorageLike } from "./session-store.js";

class MemoryStorage implements SessionStorageLike {
  private readonly map = new Map<string, string>();
  constructor(seed?: Session) {
    if (seed) {
      this.map.set("dentalprime.session", JSON.stringify(seed));
    }
  }
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

function renderWithAuth(seed?: Session): void {
  const store = new SessionStore(new MemoryStorage(seed));
  const fetchImpl = vi.fn();
  render(
    <AuthProvider
      identityUrl="http://id"
      store={store}
      fetchImpl={fetchImpl as unknown as typeof fetch}
    >
      <MemoryRouter initialEntries={["/protegido"]}>
        <Routes>
          <Route path="/login" element={<div>tela de login</div>} />
          <Route
            path="/protegido"
            element={
              <RequireAuth>
                <div>conteudo protegido</div>
              </RequireAuth>
            }
          />
        </Routes>
      </MemoryRouter>
    </AuthProvider>,
  );
}

describe("RequireAuth", () => {
  it("redireciona para /login quando nao autenticado", () => {
    renderWithAuth();
    expect(screen.getByText("tela de login")).toBeInTheDocument();
    expect(screen.queryByText("conteudo protegido")).not.toBeInTheDocument();
  });

  it("renderiza o conteudo quando autenticado", () => {
    renderWithAuth({
      tenantId: "clinic-1",
      email: "user@example.com",
      accessToken: "a",
      refreshToken: "r",
    });
    expect(screen.getByText("conteudo protegido")).toBeInTheDocument();
  });
});
