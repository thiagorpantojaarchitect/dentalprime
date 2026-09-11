import { describe, it, expect } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { jsonResponse, renderAuthed, sequencedFetch } from "../test/helpers.js";
import { TenantsPage } from "./TenantsPage.js";

function render(fetchImpl: typeof fetch): void {
  renderAuthed(<TenantsPage />, {
    fetchImpl,
    path: "/tenants",
    initialEntries: ["/tenants"],
  });
}

describe("TenantsPage", () => {
  it("lista tenants ao carregar", async () => {
    render(
      sequencedFetch([
        jsonResponse(200, {
          tenants: [{ id: "t1", name: "Rede Sorriso", active: true }],
        }),
      ]),
    );
    await waitFor(() => expect(screen.getByText("Rede Sorriso")).toBeInTheDocument());
  });

  it("provisiona um tenant e mostra confirmacao", async () => {
    render(
      sequencedFetch([
        jsonResponse(200, { tenants: [] }), // load inicial
        jsonResponse(201, { id: "t2", name: "Clinica Nova", ownerUserId: "o1" }), // provision
        jsonResponse(200, {
          tenants: [{ id: "t2", name: "Clinica Nova", active: true }],
        }), // reload
      ]),
    );
    await waitFor(() => screen.getByLabelText("Provisionar tenant"));
    await userEvent.type(screen.getByLabelText("Nome da clínica/rede"), "Clinica Nova");
    await userEvent.type(screen.getByLabelText("Nome do responsável"), "Dono");
    await userEvent.type(
      screen.getByLabelText("E-mail do responsável"),
      "dono@clinica.com",
    );
    await userEvent.click(screen.getByRole("button", { name: "Provisionar" }));
    await waitFor(() =>
      expect(
        screen.getByText(
          'Tenant "Clinica Nova" provisionado. Owner pendente de ativação.',
        ),
      ).toBeInTheDocument(),
    );
  });

  it("mostra erro de plataforma quando 403", async () => {
    render(
      sequencedFetch([
        jsonResponse(403, { error: { code: "FORBIDDEN", message: "no" } }),
      ]),
    );
    await waitFor(() =>
      expect(
        screen.getByText("Operação de plataforma: requer permissão de administração."),
      ).toBeInTheDocument(),
    );
  });
});
