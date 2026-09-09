import { describe, it, expect, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { AuthProvider } from "../auth/auth-context.js";
import {
  SessionStore,
  type Session,
  type SessionStorageLike,
} from "../auth/session-store.js";
import { PatientsPage } from "./PatientsPage.js";

class MemoryStorage implements SessionStorageLike {
  private readonly map = new Map<string, string>();
  constructor(seed: Session) {
    this.map.set("dentalprime.session", JSON.stringify(seed));
  }
  getItem(key: string): string | null {
    return this.map.get(key) ?? null;
  }
  setItem(key: string, value: string): void {
    this.map.set(key, value);
  }
  removeItem(key: string): void {
    this.map.delete(key);
  }
}

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

const seededSession: Session = {
  tenantId: "clinic-1",
  email: "user@example.com",
  accessToken: "acc",
  refreshToken: "ref",
};

function renderPatients(fetchImpl: typeof fetch): void {
  const store = new SessionStore(new MemoryStorage(seededSession));
  render(
    <AuthProvider identityUrl="http://id" store={store} fetchImpl={fetchImpl}>
      <PatientsPage />
    </AuthProvider>,
  );
}

async function fillAndSubmit(): Promise<void> {
  await userEvent.type(screen.getByLabelText("Nome completo"), "Maria Silva");
  await userEvent.type(screen.getByLabelText("CPF"), "39053344705");
  await userEvent.click(screen.getByRole("button", { name: "Cadastrar" }));
}

describe("PatientsPage", () => {
  it("renderiza o formulario de cadastro", () => {
    renderPatients(vi.fn() as unknown as typeof fetch);
    expect(screen.getByLabelText("Nome completo")).toBeInTheDocument();
    expect(screen.getByLabelText("CPF")).toBeInTheDocument();
  });

  it("cadastra e exibe o paciente criado", async () => {
    let call = 0;
    const fetchImpl = vi.fn(async () => {
      call += 1;
      // 1a: POST /patients -> { id }. 2a: GET /patients/:id -> paciente.
      return call === 1
        ? jsonResponse(201, { id: "pat-1" })
        : jsonResponse(200, {
            id: "pat-1",
            fullName: "Maria Silva",
            cpf: "39053344705",
            email: null,
            phone: null,
            active: true,
          });
    });
    renderPatients(fetchImpl as unknown as typeof fetch);
    await fillAndSubmit();
    await waitFor(() =>
      expect(screen.getByLabelText("Paciente cadastrado")).toBeInTheDocument(),
    );
    expect(screen.getByText("Maria Silva")).toBeInTheDocument();
  });

  it("mostra mensagem de conflito quando o CPF ja existe", async () => {
    const fetchImpl = vi.fn(async () =>
      jsonResponse(409, { error: { code: "CONFLICT", message: "duplicado" } }),
    );
    renderPatients(fetchImpl as unknown as typeof fetch);
    await fillAndSubmit();
    await waitFor(() =>
      expect(screen.getByText("Já existe um paciente com este CPF.")).toBeInTheDocument(),
    );
  });
});
