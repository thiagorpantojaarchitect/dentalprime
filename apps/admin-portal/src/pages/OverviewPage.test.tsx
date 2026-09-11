import { describe, it, expect } from "vitest";
import { screen, waitFor } from "@testing-library/react";

import { jsonResponse, renderAuthed, sequencedFetch } from "../test/helpers.js";
import { OverviewPage } from "./OverviewPage.js";

function render(fetchImpl: typeof fetch): void {
  renderAuthed(<OverviewPage />, { fetchImpl, path: "/", initialEntries: ["/"] });
}

describe("OverviewPage", () => {
  it("carrega tenant e contadores de unidades e usuarios", async () => {
    render(
      sequencedFetch([
        jsonResponse(200, { id: "t1", name: "Rede Sorriso", active: true }), // currentTenant
        jsonResponse(200, { units: [{ id: "u1", name: "Centro", active: true }] }), // units
        jsonResponse(200, {
          users: [
            { id: "x", email: "a@a.com", displayName: "A", status: "active", roles: [] },
          ],
        }), // users
      ]),
    );
    await waitFor(() => expect(screen.getByText("Rede Sorriso")).toBeInTheDocument());
    expect(screen.getByText("Unidades")).toBeInTheDocument();
  });

  it("mostra erro de permissao quando 403", async () => {
    render(
      sequencedFetch([
        jsonResponse(403, { error: { code: "FORBIDDEN", message: "no" } }),
      ]),
    );
    await waitFor(() =>
      expect(
        screen.getByText("Você não tem permissão de administração."),
      ).toBeInTheDocument(),
    );
  });
});
