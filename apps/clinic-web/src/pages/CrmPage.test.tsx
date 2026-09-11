import { describe, it, expect } from "vitest";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { jsonResponse, renderAuthed, sequencedFetch } from "../test/helpers.js";
import { CrmPage } from "./CrmPage.js";

function render(fetchImpl: typeof fetch): void {
  renderAuthed(<CrmPage />, { fetchImpl, path: "/crm", initialEntries: ["/crm"] });
}

describe("CrmPage", () => {
  it("cria um lead e exibe o status", async () => {
    render(sequencedFetch([jsonResponse(201, { id: "lead-1", status: "new" })]));
    const form = screen.getByRole("form", { name: "Criar lead" });
    await userEvent.type(within(form).getByLabelText("Nome"), "Contato Teste");
    await userEvent.click(within(form).getByRole("button", { name: "Criar lead" }));
    await waitFor(() => expect(within(form).getByText("new")).toBeInTheDocument());
  });

  it("registra opt-out de marketing", async () => {
    render(sequencedFetch([jsonResponse(201, { id: "c-1", decision: "opted_out" })]));
    await userEvent.type(
      screen.getByLabelText("Contato (ref)"),
      "email:teste@example.com",
    );
    await userEvent.click(screen.getByRole("button", { name: "Opt-out" }));
    await waitFor(() =>
      expect(screen.getByText("Consentimento: opted_out.")).toBeInTheDocument(),
    );
  });
});
