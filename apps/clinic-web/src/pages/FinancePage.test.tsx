import { describe, it, expect, vi } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { jsonResponse, renderAuthed, sequencedFetch } from "../test/helpers.js";
import { FinancePage } from "./FinancePage.js";

function render(fetchImpl: typeof fetch): void {
  renderAuthed(<FinancePage />, {
    fetchImpl,
    path: "/financeiro",
    initialEntries: ["/financeiro"],
  });
}

describe("FinancePage", () => {
  it("cria fatura e exibe o painel da fatura", async () => {
    render(sequencedFetch([jsonResponse(201, { id: "inv-1", status: "open" })]));
    await userEvent.type(screen.getByLabelText("Paciente (id)"), "pat-1");
    await userEvent.type(screen.getByLabelText("Unidade (id)"), "unit-1");
    await userEvent.click(screen.getByRole("button", { name: "Criar fatura" }));
    await waitFor(() =>
      expect(screen.getByLabelText("Adicionar item")).toBeInTheDocument(),
    );
  });

  it("mostra erro quando o pagamento excede o saldo", async () => {
    const fetchImpl = sequencedFetch([
      jsonResponse(201, { id: "inv-1", status: "open" }),
      jsonResponse(409, { error: { code: "PAYMENT_EXCEEDS_BALANCE", message: "x" } }),
    ]);
    render(fetchImpl);
    await userEvent.type(screen.getByLabelText("Paciente (id)"), "pat-1");
    await userEvent.type(screen.getByLabelText("Unidade (id)"), "unit-1");
    await userEvent.click(screen.getByRole("button", { name: "Criar fatura" }));
    await waitFor(() => screen.getByLabelText("Registrar pagamento"));
    await userEvent.type(screen.getByLabelText("Valor (ex.: 120.00)"), "999.00");
    await userEvent.click(screen.getByRole("button", { name: "Pagar" }));
    await waitFor(() =>
      expect(
        screen.getByText("O pagamento excede o saldo da fatura."),
      ).toBeInTheDocument(),
    );
  });

  it("valida valor monetario invalido no item sem chamar o backend", async () => {
    const fetchImpl = vi.fn(async () =>
      jsonResponse(201, { id: "inv-1", status: "open" }),
    );
    render(fetchImpl as unknown as typeof fetch);
    await userEvent.type(screen.getByLabelText("Paciente (id)"), "pat-1");
    await userEvent.type(screen.getByLabelText("Unidade (id)"), "unit-1");
    await userEvent.click(screen.getByRole("button", { name: "Criar fatura" }));
    await waitFor(() => screen.getByLabelText("Adicionar item"));
    const callsBefore = fetchImpl.mock.calls.length;
    await userEvent.type(screen.getByLabelText("Descrição"), "Consulta");
    await userEvent.type(screen.getByLabelText("Preço (ex.: 120.00)"), "abc");
    await userEvent.click(screen.getByRole("button", { name: "Adicionar" }));
    await waitFor(() =>
      expect(
        screen.getByText("Preço inválido (use formato 120.00)."),
      ).toBeInTheDocument(),
    );
    // Nao houve nova chamada de rede (validacao no cliente).
    expect(fetchImpl.mock.calls.length).toBe(callsBefore);
  });
});
