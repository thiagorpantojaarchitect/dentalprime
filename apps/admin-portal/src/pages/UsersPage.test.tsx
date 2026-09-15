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

describe("UsersPage (admin-portal)", () => {
  it("lista usuarios com papeis e situacao", async () => {
    render(
      sequencedFetch([
        jsonResponse(200, {
          users: [
            {
              id: "u1",
              email: "dra@clinica.com",
              displayName: "Dra. Marina",
              status: "active",
              roles: ["owner"],
            },
          ],
        }),
      ]),
    );
    await waitFor(() => expect(screen.getByText("Dra. Marina")).toBeInTheDocument());
    expect(screen.getByText("owner")).toBeInTheDocument();
    expect(screen.getByText("active")).toBeInTheDocument();
  });

  it("mostra erro de permissao quando 403", async () => {
    render(
      sequencedFetch([
        jsonResponse(403, { error: { code: "FORBIDDEN", message: "no" } }),
      ]),
    );
    await waitFor(() =>
      expect(screen.getByText("Sem permissão para listar usuários.")).toBeInTheDocument(),
    );
  });

  it("pagina listas extensas sem renderizar todos os registros de uma vez", async () => {
    const firstPage = Array.from({ length: 10 }, (_, index) => ({
      id: `u${index + 1}`,
      email: `user${index + 1}@example.com`,
      displayName: `Usuário ${index + 1}`,
      status: "active",
      roles: ["manager"],
    }));
    render(
      sequencedFetch([
        jsonResponse(200, {
          users: firstPage,
          page: 1,
          pageSize: 10,
          hasMore: true,
        }),
        jsonResponse(200, {
          users: [
            {
              id: "u11",
              email: "user11@example.com",
              displayName: "Usuário 11",
              status: "active",
              roles: ["manager"],
            },
          ],
          page: 2,
          pageSize: 10,
          hasMore: false,
        }),
      ]),
    );

    await waitFor(() => expect(screen.getByText("Usuário 1")).toBeInTheDocument());
    expect(screen.queryByText("Usuário 11")).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Próxima" }));
    await waitFor(() => expect(screen.getByText("Usuário 11")).toBeInTheDocument());
    expect(screen.getByText("Página 2")).toBeInTheDocument();
  });
});
