import { describe, it, expect } from "vitest";
import { screen, waitFor } from "@testing-library/react";

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
});
