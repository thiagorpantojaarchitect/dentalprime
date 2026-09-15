import { screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { jsonResponse, renderAuthed } from "../test/helpers.js";
import { DashboardPage } from "./DashboardPage.js";

function dashboardFetch(): typeof fetch {
  return vi.fn(async (input: string | URL | Request) => {
    const url = String(input);
    if (url.includes("/api/scheduling/dashboard")) {
      return jsonResponse(200, {
        from: "2026-09-15T00:00:00.000Z",
        to: "2026-09-22T00:00:00.000Z",
        byStatus: [],
        total: 7,
        noShowRate: 0.125,
        attendanceRate: 0.875,
      });
    }
    if (url.includes("/api/finance/dashboard")) {
      return jsonResponse(200, {
        byStatus: [],
        totalInvoices: 4,
        billedCents: 80000,
        receivedCents: 50000,
        outstandingCents: 30000,
      });
    }
    if (url.includes("/api/crm/dashboard")) {
      return jsonResponse(200, {
        funnel: [],
        totalLeads: 12,
        conversionRate: 0.25,
      });
    }
    return jsonResponse(404, { error: { code: "NOT_FOUND" } });
  }) as unknown as typeof fetch;
}

describe("DashboardPage", () => {
  it("carrega os indicadores reais de agenda, financeiro e CRM", async () => {
    renderAuthed(<DashboardPage />, { fetchImpl: dashboardFetch() });

    await waitFor(() => expect(screen.getByText("7")).toBeInTheDocument());
    expect(screen.getByText("Taxa de faltas: 12,5%")).toBeInTheDocument();
    expect(screen.getByText(/R\$\s*300,00/)).toBeInTheDocument();
    expect(screen.getByText("12")).toBeInTheDocument();
    expect(screen.getByText("Conversão: 25%")).toBeInTheDocument();
  });

  it("preserva os indicadores disponíveis quando um domínio falha", async () => {
    const fetchImpl = vi.fn(async (input: string | URL | Request) => {
      const url = String(input);
      if (url.includes("/api/scheduling/dashboard")) {
        return jsonResponse(403, { error: { code: "FORBIDDEN" } });
      }
      if (url.includes("/api/finance/dashboard")) {
        return jsonResponse(200, {
          byStatus: [],
          totalInvoices: 1,
          billedCents: 1000,
          receivedCents: 1000,
          outstandingCents: 0,
        });
      }
      return jsonResponse(200, { funnel: [], totalLeads: 2, conversionRate: 0 });
    }) as unknown as typeof fetch;

    renderAuthed(<DashboardPage />, { fetchImpl });

    await waitFor(() =>
      expect(
        screen.getByText("Alguns indicadores não estão disponíveis para o seu perfil."),
      ).toBeInTheDocument(),
    );
    expect(screen.getByText("2")).toBeInTheDocument();
  });
});
