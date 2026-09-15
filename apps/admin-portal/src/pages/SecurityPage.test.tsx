import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";

import { AuthProvider } from "../auth/auth-context.js";
import { SessionStore } from "../auth/session-store.js";
import { MemoryStorage } from "../test/helpers.js";
import { SecurityPage } from "./SecurityPage.js";

describe("SecurityPage (admin-portal)", () => {
  it("troca a senha, encerra a sessao local e volta ao login", async () => {
    const store = new SessionStore(new MemoryStorage());
    store.save({
      tenantId: "tenant-1",
      email: "admin@example.com",
      accessToken: "access",
      refreshToken: "refresh",
    });
    const fetchImpl = vi.fn(async () => new Response(null, { status: 204 }));

    render(
      <AuthProvider identityUrl="http://id" store={store} fetchImpl={fetchImpl}>
        <MemoryRouter initialEntries={["/seguranca"]}>
          <Routes>
            <Route path="/seguranca" element={<SecurityPage />} />
            <Route path="/login" element={<p>login renovado</p>} />
          </Routes>
        </MemoryRouter>
      </AuthProvider>,
    );

    await userEvent.type(screen.getByLabelText("Senha atual"), "senha-antiga");
    await userEvent.type(screen.getByLabelText("Nova senha"), "senha-nova-123");
    await userEvent.type(
      screen.getByLabelText("Confirme a nova senha"),
      "senha-nova-123",
    );
    await userEvent.click(screen.getByRole("button", { name: "Alterar senha" }));

    await waitFor(() => expect(screen.getByText("login renovado")).toBeInTheDocument());
    expect(store.load()).toBeNull();
    expect(fetchImpl).toHaveBeenCalledWith(
      expect.stringMatching(/\/users\/me\/change-password$/u),
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          currentPassword: "senha-antiga",
          newPassword: "senha-nova-123",
        }),
      }),
    );
  });
});
