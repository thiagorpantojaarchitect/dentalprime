import { describe, it, expect, vi } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { jsonResponse, renderAuthed, sequencedFetch } from "../test/helpers.js";
import { UsersPage } from "./UsersPage.js";

function render(fetchImpl: typeof fetch): void {
  renderAuthed(<UsersPage />, {
    fetchImpl,
    path: "/usuarios",
    initialEntries: ["/usuarios"],
  });
}

describe("UsersPage", () => {
  it("convida um usuario e mostra o status", async () => {
    render(
      sequencedFetch([
        jsonResponse(201, {
          id: "u-1",
          status: "pending",
          activationToken: "a".repeat(32),
          activationExpiresAt: "2026-09-18T12:00:00.000Z",
        }),
      ]),
    );
    await userEvent.type(screen.getByLabelText("E-mail"), "novo@example.com");
    await userEvent.type(screen.getByLabelText("Nome"), "Novo Usuário");
    await userEvent.click(screen.getByRole("button", { name: "Convidar" }));
    await waitFor(() => expect(screen.getByText("pending")).toBeInTheDocument());
    expect(
      screen.getByLabelText("Token de ativação (exibido uma única vez)"),
    ).toHaveValue("a".repeat(32));
  });

  it("mostra erro de permissao ao convidar sem autorizacao", async () => {
    render(
      sequencedFetch([
        jsonResponse(403, { error: { code: "FORBIDDEN", message: "no" } }),
      ]),
    );
    await userEvent.type(screen.getByLabelText("E-mail"), "novo@example.com");
    await userEvent.type(screen.getByLabelText("Nome"), "Novo Usuário");
    await userEvent.click(screen.getByRole("button", { name: "Convidar" }));
    await waitFor(() =>
      expect(
        screen.getByText("Você não tem permissão para gerenciar usuários."),
      ).toBeInTheDocument(),
    );
  });

  it("vincula uma conta de paciente ao prontuario", async () => {
    const fetchImpl = vi.fn(async () =>
      jsonResponse(200, {
        patientId: "11111111-1111-4111-8111-111111111111",
        portalUserId: "22222222-2222-4222-8222-222222222222",
      }),
    );
    render(fetchImpl as unknown as typeof fetch);

    await userEvent.type(
      screen.getByLabelText("ID do prontuário"),
      "11111111-1111-4111-8111-111111111111",
    );
    await userEvent.type(
      screen.getByLabelText("ID do usuário paciente"),
      "22222222-2222-4222-8222-222222222222",
    );
    await userEvent.click(screen.getByRole("button", { name: "Vincular conta" }));

    await waitFor(() =>
      expect(screen.getByText("Conta vinculada ao prontuário.")).toBeInTheDocument(),
    );
    expect(fetchImpl).toHaveBeenCalledWith(
      expect.stringContaining(
        "/patients/11111111-1111-4111-8111-111111111111/portal-user",
      ),
      expect.objectContaining({ method: "PUT" }),
    );
  });
});
