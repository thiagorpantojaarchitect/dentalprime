import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { renderAuthed } from "../test/helpers.js";
import { ActivationPage } from "./ActivationPage.js";

describe("ActivationPage (admin-portal)", () => {
  it("ativa o owner com o token retornado no provisionamento", async () => {
    const fetchImpl = vi.fn(async () => new Response(null, { status: 204 }));
    renderAuthed(<ActivationPage />, {
      fetchImpl: fetchImpl as unknown as typeof fetch,
      path: "/ativar",
      initialEntries: ["/ativar"],
    });

    await userEvent.type(screen.getByLabelText("Tenant"), "tenant-1");
    await userEvent.type(screen.getByLabelText("Token de convite"), "b".repeat(32));
    await userEvent.type(screen.getByLabelText("Nova senha"), "senha-segura");
    await userEvent.type(screen.getByLabelText("Confirmar senha"), "senha-segura");
    await userEvent.click(screen.getByRole("button", { name: "Ativar conta" }));

    await waitFor(() =>
      expect(screen.getByRole("status")).toHaveTextContent("Conta ativada."),
    );
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });
});
