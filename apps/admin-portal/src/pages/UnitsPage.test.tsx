import { describe, it, expect } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { jsonResponse, renderAuthed, sequencedFetch } from "../test/helpers.js";
import { UnitsPage } from "./UnitsPage.js";

function render(fetchImpl: typeof fetch): void {
  renderAuthed(<UnitsPage />, {
    fetchImpl,
    path: "/unidades",
    initialEntries: ["/unidades"],
  });
}

describe("UnitsPage", () => {
  it("lista as unidades ao carregar", async () => {
    render(
      sequencedFetch([
        jsonResponse(200, {
          units: [{ id: "u1", name: "Unidade Centro", active: true }],
        }),
      ]),
    );
    await waitFor(() => expect(screen.getByText("Unidade Centro")).toBeInTheDocument());
  });

  it("cria uma unidade e recarrega a lista", async () => {
    render(
      sequencedFetch([
        jsonResponse(200, { units: [] }), // load inicial
        jsonResponse(201, { id: "u2", name: "Unidade Sul", active: true }), // create
        jsonResponse(200, { units: [{ id: "u2", name: "Unidade Sul", active: true }] }), // reload
      ]),
    );
    await waitFor(() => screen.getByLabelText("Criar unidade"));
    await userEvent.type(screen.getByLabelText("Nome"), "Unidade Sul");
    await userEvent.click(screen.getByRole("button", { name: "Criar" }));
    await waitFor(() => expect(screen.getByText("Unidade Sul")).toBeInTheDocument());
  });

  it("mostra erro de permissao ao criar sem autorizacao", async () => {
    render(
      sequencedFetch([
        jsonResponse(200, { units: [] }),
        jsonResponse(403, { error: { code: "FORBIDDEN", message: "no" } }),
      ]),
    );
    await waitFor(() => screen.getByLabelText("Criar unidade"));
    await userEvent.type(screen.getByLabelText("Nome"), "X");
    await userEvent.click(screen.getByRole("button", { name: "Criar" }));
    await waitFor(() =>
      expect(
        screen.getByText("Sem permissão para gerenciar unidades."),
      ).toBeInTheDocument(),
    );
  });
});
