import { describe, it, expect } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { jsonResponse, renderAuthed, sequencedFetch } from "../test/helpers.js";
import { TreatmentsPage } from "./TreatmentsPage.js";

function render(fetchImpl: typeof fetch): void {
  renderAuthed(<TreatmentsPage />, {
    fetchImpl,
    path: "/tratamentos",
    initialEntries: ["/tratamentos"],
  });
}

describe("TreatmentsPage", () => {
  it("lista o catalogo de procedimentos ao carregar", async () => {
    render(
      sequencedFetch([
        jsonResponse(200, {
          procedures: [
            { id: "p1", name: "Limpeza", description: "Profilaxia", licensedCode: null },
          ],
        }),
      ]),
    );
    await waitFor(() => expect(screen.getByText("Limpeza")).toBeInTheDocument());
  });

  it("bloqueia custo base invalido sem chamar o backend", async () => {
    render(sequencedFetch([jsonResponse(200, { procedures: [] })]));
    await waitFor(() => screen.getByLabelText("Criar procedimento"));
    await userEvent.type(screen.getByLabelText("Nome"), "Canal");
    await userEvent.type(screen.getByLabelText("Custo base (ex.: 120.00)"), "10,5");
    await userEvent.click(screen.getByRole("button", { name: "Criar" }));
    await waitFor(() =>
      expect(
        screen.getByText("Custo base inválido (use formato 120.00)."),
      ).toBeInTheDocument(),
    );
  });

  it("cria um plano e mostra o painel do plano", async () => {
    render(
      sequencedFetch([
        jsonResponse(200, { procedures: [] }), // load inicial
        jsonResponse(201, { planKey: "plan-1", version: 1 }), // createPlan
      ]),
    );
    await waitFor(() => screen.getByLabelText("Criar plano"));
    await userEvent.type(screen.getByLabelText("Paciente (id)"), "pat-1");
    await userEvent.type(screen.getByLabelText("Título"), "Plano inicial");
    await userEvent.click(screen.getByRole("button", { name: "Criar plano" }));
    await waitFor(() => expect(screen.getByLabelText("Plano ativo")).toBeInTheDocument());
  });
});
