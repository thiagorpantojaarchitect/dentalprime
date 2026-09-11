import { describe, it, expect, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";

import { AuthProvider } from "../auth/auth-context.js";
import { SessionStore } from "../auth/session-store.js";
import { MemoryStorage, jsonResponse } from "../test/helpers.js";
import { LoginPage } from "./LoginPage.js";

function renderLogin(fetchImpl: typeof fetch): void {
  const store = new SessionStore(new MemoryStorage());
  render(
    <AuthProvider identityUrl="http://id" store={store} fetchImpl={fetchImpl}>
      <MemoryRouter initialEntries={["/login"]}>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/" element={<div>visão geral</div>} />
        </Routes>
      </MemoryRouter>
    </AuthProvider>,
  );
}

async function fill(): Promise<void> {
  await userEvent.type(screen.getByLabelText("Tenant"), "clinic-1");
  await userEvent.type(screen.getByLabelText("E-mail"), "admin@example.com");
  await userEvent.type(screen.getByLabelText("Senha"), "secret");
  await userEvent.click(screen.getByRole("button", { name: "Entrar" }));
}

describe("LoginPage (admin-portal)", () => {
  it("renderiza o formulario administrativo", () => {
    renderLogin(vi.fn() as unknown as typeof fetch);
    expect(screen.getByLabelText("Tenant")).toBeInTheDocument();
    expect(screen.getByLabelText("Senha")).toBeInTheDocument();
  });

  it("em sucesso, navega para a visao geral", async () => {
    const fetchImpl = vi.fn(async () =>
      jsonResponse(200, { accessToken: "a", refreshToken: "r" }),
    );
    renderLogin(fetchImpl as unknown as typeof fetch);
    await fill();
    await waitFor(() => expect(screen.getByText("visão geral")).toBeInTheDocument());
  });

  it("em 401, mostra credenciais invalidas", async () => {
    const fetchImpl = vi.fn(async () =>
      jsonResponse(401, { error: { code: "INVALID_CREDENTIALS" } }),
    );
    renderLogin(fetchImpl as unknown as typeof fetch);
    await fill();
    await waitFor(() =>
      expect(screen.getByText("Credenciais invalidas.")).toBeInTheDocument(),
    );
  });
});
