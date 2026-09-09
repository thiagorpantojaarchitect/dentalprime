import { describe, it, expect, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";

import { AuthProvider } from "../auth/auth-context.js";
import { SessionStore, type SessionStorageLike } from "../auth/session-store.js";
import { LoginPage } from "./LoginPage.js";

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

function renderLogin(fetchImpl: typeof fetch): void {
  const store = new SessionStore(new MemoryStorage());
  render(
    <AuthProvider identityUrl="http://id" store={store} fetchImpl={fetchImpl}>
      <MemoryRouter initialEntries={["/login"]}>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/" element={<div>pagina inicial</div>} />
        </Routes>
      </MemoryRouter>
    </AuthProvider>,
  );
}

async function fillAndSubmit(): Promise<void> {
  await userEvent.type(screen.getByLabelText("Clínica (tenant)"), "clinic-1");
  await userEvent.type(screen.getByLabelText("E-mail"), "user@example.com");
  await userEvent.type(screen.getByLabelText("Senha"), "secret");
  await userEvent.click(screen.getByRole("button", { name: "Entrar" }));
}

describe("LoginPage", () => {
  it("renderiza o formulario", () => {
    renderLogin(vi.fn() as unknown as typeof fetch);
    expect(screen.getByLabelText("Clínica (tenant)")).toBeInTheDocument();
    expect(screen.getByLabelText("E-mail")).toBeInTheDocument();
    expect(screen.getByLabelText("Senha")).toBeInTheDocument();
  });

  it("em sucesso, navega para a pagina inicial", async () => {
    const fetchImpl = vi.fn(async () =>
      jsonResponse(200, { accessToken: "a", refreshToken: "r" }),
    );
    renderLogin(fetchImpl as unknown as typeof fetch);
    await fillAndSubmit();
    await waitFor(() => expect(screen.getByText("pagina inicial")).toBeInTheDocument());
  });

  it("em 401, mostra mensagem generica de credenciais invalidas", async () => {
    const fetchImpl = vi.fn(async () =>
      jsonResponse(401, { error: { code: "UNAUTHENTICATED" } }),
    );
    renderLogin(fetchImpl as unknown as typeof fetch);
    await fillAndSubmit();
    await waitFor(() =>
      expect(screen.getByText("Credenciais invalidas.")).toBeInTheDocument(),
    );
  });
});
