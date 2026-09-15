import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { renderAuthed } from "../test/helpers.js";
import { ActivationPage } from "./ActivationPage.js";

describe("ActivationPage", () => {
  it("ativa a conta com tenant e token sem enviar userId", async () => {
    const fetchImpl = vi.fn(async () => new Response(null, { status: 204 }));
    renderAuthed(<ActivationPage />, {
      fetchImpl: fetchImpl as unknown as typeof fetch,
      path: "/ativar",
      initialEntries: ["/ativar"],
    });

    await userEvent.type(screen.getByLabelText("Clínica (tenant)"), "tenant-1");
    await userEvent.type(screen.getByLabelText("Token de convite"), "a".repeat(32));
    await userEvent.type(screen.getByLabelText("Nova senha"), "senha-segura");
    await userEvent.type(screen.getByLabelText("Confirmar senha"), "senha-segura");
    await userEvent.click(screen.getByRole("button", { name: "Ativar conta" }));

    await waitFor(() =>
      expect(screen.getByRole("status")).toHaveTextContent("Conta ativada."),
    );
    const [, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(JSON.parse(String(init.body))).toEqual({
      tenantId: "tenant-1",
      activationToken: "a".repeat(32),
      password: "senha-segura",
    });
  });

  it("nao chama a API quando as senhas divergem", async () => {
    const fetchImpl = vi.fn();
    renderAuthed(<ActivationPage />, {
      fetchImpl: fetchImpl as unknown as typeof fetch,
      path: "/ativar",
      initialEntries: ["/ativar"],
    });

    await userEvent.type(screen.getByLabelText("Clínica (tenant)"), "tenant-1");
    await userEvent.type(screen.getByLabelText("Token de convite"), "a".repeat(32));
    await userEvent.type(screen.getByLabelText("Nova senha"), "senha-segura");
    await userEvent.type(screen.getByLabelText("Confirmar senha"), "senha-diferente");
    await userEvent.click(screen.getByRole("button", { name: "Ativar conta" }));

    expect(screen.getByText("As senhas não conferem.")).toBeInTheDocument();
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});
