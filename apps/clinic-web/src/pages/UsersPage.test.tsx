import { describe, it, expect } from "vitest";
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
    render(sequencedFetch([jsonResponse(201, { id: "u-1", status: "invited" })]));
    await userEvent.type(screen.getByLabelText("E-mail"), "novo@example.com");
    await userEvent.type(screen.getByLabelText("Nome"), "Novo Usuário");
    await userEvent.click(screen.getByRole("button", { name: "Convidar" }));
    await waitFor(() => expect(screen.getByText("invited")).toBeInTheDocument());
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
});
