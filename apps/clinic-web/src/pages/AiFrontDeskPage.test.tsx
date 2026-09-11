import { describe, it, expect } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { jsonResponse, renderAuthed, sequencedFetch } from "../test/helpers.js";
import { AiFrontDeskPage } from "./AiFrontDeskPage.js";

function render(fetchImpl: typeof fetch): void {
  renderAuthed(<AiFrontDeskPage />, {
    fetchImpl,
    path: "/recepcao-ia",
    initialEntries: ["/recepcao-ia"],
  });
}

describe("AiFrontDeskPage", () => {
  it("identifica a IA como assistiva", () => {
    render(sequencedFetch([jsonResponse(200, {})]));
    expect(screen.getByText("IA assistiva")).toBeInTheDocument();
  });

  it("inicia conversa e responde mensagem da IA", async () => {
    render(
      sequencedFetch([
        jsonResponse(201, { id: "conv-1", status: "open" }), // start
        jsonResponse(201, {
          reply: { content: "Olá! Como ajudo?", isAI: true },
          handedOff: false,
        }),
      ]),
    );
    await userEvent.click(screen.getByRole("button", { name: "Iniciar" }));
    await waitFor(() => screen.getByLabelText("Conversa"));
    await userEvent.type(screen.getByLabelText("Mensagem"), "Quero agendar");
    await userEvent.click(screen.getByRole("button", { name: "Enviar" }));
    await waitFor(() => expect(screen.getByText("Olá! Como ajudo?")).toBeInTheDocument());
  });

  it("bloqueia conteudo clinico e sinaliza handoff", async () => {
    render(
      sequencedFetch([
        jsonResponse(201, { id: "conv-1", status: "open" }),
        jsonResponse(422, {
          error: { code: "CLINICAL_CONTENT_BLOCKED", message: "clinico" },
        }),
      ]),
    );
    await userEvent.click(screen.getByRole("button", { name: "Iniciar" }));
    await waitFor(() => screen.getByLabelText("Conversa"));
    await userEvent.type(screen.getByLabelText("Mensagem"), "Que remédio tomar?");
    await userEvent.click(screen.getByRole("button", { name: "Enviar" }));
    // A mensagem de bloqueio aparece no banner de erro e na linha do chat.
    await waitFor(() =>
      expect(
        screen.getAllByText(
          "Conteúdo clínico: a IA não responde e encaminha para atendimento humano.",
        ).length,
      ).toBeGreaterThan(0),
    );
  });
});
