import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { jsonResponse, renderAuthed } from "../test/helpers.js";
import { SchedulePage } from "./SchedulePage.js";

const UNIT_ID = "11111111-1111-4111-8111-111111111111";
const USER_ID = "22222222-2222-4222-8222-222222222222";
const PROVIDER_ID = "33333333-3333-4333-8333-333333333333";
const RESOURCE_ID = "44444444-4444-4444-8444-444444444444";
const PATIENT_ID = "55555555-5555-4555-8555-555555555555";

interface CapturedRequest {
  readonly url: string;
  readonly method: string;
  readonly body: Record<string, unknown> | null;
}

function requestRouter(
  requests: CapturedRequest[],
  options: { readonly appointmentConflict?: boolean } = {},
): typeof fetch {
  return vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    const method = init?.method ?? "GET";
    const body = init?.body
      ? (JSON.parse(init.body as string) as Record<string, unknown>)
      : null;
    requests.push({ url, method, body });

    if (url.includes("/providers?") && method === "GET") {
      return jsonResponse(200, {
        providers: [
          {
            id: PROVIDER_ID,
            unitId: UNIT_ID,
            userId: USER_ID,
            displayName: "Dra. Ana",
          },
        ],
      });
    }
    if (url.includes("/resources?") && method === "GET") {
      return jsonResponse(200, {
        resources: [
          { id: RESOURCE_ID, unitId: UNIT_ID, name: "Cadeira 1", kind: "chair" },
        ],
      });
    }
    if (url.endsWith("/providers") && method === "POST") {
      return jsonResponse(201, {
        id: PROVIDER_ID,
        unitId: UNIT_ID,
        userId: USER_ID,
        displayName: "Dra. Beatriz",
      });
    }
    if (url.endsWith("/resources") && method === "POST") {
      return jsonResponse(201, {
        id: RESOURCE_ID,
        unitId: UNIT_ID,
        name: "Sala 2",
        kind: "room",
      });
    }
    if (url.endsWith("/availability") && method === "POST") {
      return jsonResponse(201, { id: "window-1" });
    }
    if (url.endsWith("/appointments") && method === "POST") {
      if (options.appointmentConflict) {
        return jsonResponse(409, {
          error: {
            code: "SCHEDULE_CONFLICT",
            message: "internal-provider-details-must-not-be-shown",
          },
        });
      }
      return jsonResponse(201, { id: "appointment-1", status: "booked" });
    }
    return jsonResponse(500, { error: { code: "INTERNAL" } });
  }) as unknown as typeof fetch;
}

function renderSchedule(fetchImpl: typeof fetch): void {
  renderAuthed(<SchedulePage />, {
    fetchImpl,
    path: "/agenda",
    initialEntries: ["/agenda"],
  });
}

async function loadCatalog(): Promise<void> {
  const unitForm = screen.getByRole("form", { name: "Selecionar unidade" });
  await userEvent.type(within(unitForm).getByLabelText("Unidade (id)"), UNIT_ID);
  await userEvent.click(
    within(unitForm).getByRole("button", { name: "Carregar catálogo" }),
  );
  await screen.findByText("Dra. Ana", { selector: "td" });
  await screen.findByText("Cadeira 1", { selector: "td" });
}

describe("SchedulePage", () => {
  it("carrega o catálogo e agenda com profissional e recurso selecionados", async () => {
    const requests: CapturedRequest[] = [];
    renderSchedule(requestRouter(requests));
    await loadCatalog();

    const form = screen.getByRole("form", { name: "Novo agendamento" });
    await userEvent.type(within(form).getByLabelText("Paciente (id)"), PATIENT_ID);
    await userEvent.selectOptions(
      within(form).getByLabelText("Profissional"),
      PROVIDER_ID,
    );
    await userEvent.selectOptions(
      within(form).getByLabelText("Recurso (opcional)"),
      RESOURCE_ID,
    );
    fireEvent.change(within(form).getByLabelText("Início da consulta"), {
      target: { value: "2026-09-20T09:00" },
    });
    fireEvent.change(within(form).getByLabelText("Fim da consulta"), {
      target: { value: "2026-09-20T10:00" },
    });
    await userEvent.click(within(form).getByRole("button", { name: "Agendar" }));

    await waitFor(() => expect(within(form).getByText("booked")).toBeInTheDocument());
    const request = requests.find(
      (item) => item.url.endsWith("/appointments") && item.method === "POST",
    );
    expect(request?.body).toEqual(
      expect.objectContaining({
        unitId: UNIT_ID,
        patientId: PATIENT_ID,
        providerId: PROVIDER_ID,
        resourceId: RESOURCE_ID,
      }),
    );
  });

  it("cadastra catálogo e registra uma janela de bloqueio", async () => {
    const requests: CapturedRequest[] = [];
    renderSchedule(requestRouter(requests));

    await userEvent.type(screen.getByLabelText("Unidade (id)"), UNIT_ID);

    const providerForm = screen.getByRole("form", { name: "Cadastrar profissional" });
    await userEvent.type(
      within(providerForm).getByLabelText("Usuário do profissional (id)"),
      USER_ID,
    );
    await userEvent.type(
      within(providerForm).getByLabelText("Nome de exibição"),
      "Dra. Beatriz",
    );
    await userEvent.click(
      within(providerForm).getByRole("button", { name: "Cadastrar profissional" }),
    );
    await within(providerForm).findByText(
      "Profissional adicionado ao catálogo da unidade.",
    );

    const resourceForm = screen.getByRole("form", { name: "Cadastrar recurso" });
    await userEvent.type(
      within(resourceForm).getByLabelText("Nome do recurso"),
      "Sala 2",
    );
    await userEvent.type(
      within(resourceForm).getByLabelText("Tipo do recurso (ex.: cadeira)"),
      "room",
    );
    await userEvent.click(
      within(resourceForm).getByRole("button", { name: "Cadastrar recurso" }),
    );
    await within(resourceForm).findByText("Recurso adicionado ao catálogo da unidade.");

    const availabilityForm = screen.getByRole("form", {
      name: "Registrar disponibilidade",
    });
    await userEvent.selectOptions(
      within(availabilityForm).getByLabelText("Recurso (opcional)"),
      RESOURCE_ID,
    );
    await userEvent.selectOptions(
      within(availabilityForm).getByLabelText("Tipo da janela"),
      "block",
    );
    fireEvent.change(within(availabilityForm).getByLabelText("Início da janela"), {
      target: { value: "2026-09-21T12:00" },
    });
    fireEvent.change(within(availabilityForm).getByLabelText("Fim da janela"), {
      target: { value: "2026-09-21T13:00" },
    });
    await userEvent.click(
      within(availabilityForm).getByRole("button", { name: "Registrar janela" }),
    );

    await within(availabilityForm).findByText("Bloqueio de agenda registrado.");
    const request = requests.find(
      (item) => item.url.endsWith("/availability") && item.method === "POST",
    );
    expect(request?.body).toEqual(
      expect.objectContaining({
        unitId: UNIT_ID,
        providerId: PROVIDER_ID,
        resourceId: RESOURCE_ID,
        kind: "block",
      }),
    );
  });

  it("exibe conflito sem vazar a mensagem interna do backend", async () => {
    const requests: CapturedRequest[] = [];
    renderSchedule(requestRouter(requests, { appointmentConflict: true }));
    await loadCatalog();

    const form = screen.getByRole("form", { name: "Novo agendamento" });
    await userEvent.type(within(form).getByLabelText("Paciente (id)"), PATIENT_ID);
    fireEvent.change(within(form).getByLabelText("Início da consulta"), {
      target: { value: "2026-09-20T09:00" },
    });
    fireEvent.change(within(form).getByLabelText("Fim da consulta"), {
      target: { value: "2026-09-20T10:00" },
    });
    await userEvent.click(within(form).getByRole("button", { name: "Agendar" }));

    await within(form).findByText(
      "Conflito de horário: o profissional ou recurso já está ocupado.",
    );
    expect(
      screen.queryByText("internal-provider-details-must-not-be-shown"),
    ).not.toBeInTheDocument();
  });
});
