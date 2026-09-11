import { describe, it, expect } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";

import { AuthProvider } from "../auth/auth-context.js";
import { SessionStore } from "../auth/session-store.js";
import {
  MemoryStorage,
  jsonResponse,
  seededSession,
  sequencedFetch,
} from "../test/helpers.js";
import { PatientDetailPage } from "./PatientDetailPage.js";

function renderDetail(fetchImpl: typeof fetch): void {
  const store = new SessionStore(new MemoryStorage(seededSession));
  render(
    <AuthProvider identityUrl="http://id" store={store} fetchImpl={fetchImpl}>
      <MemoryRouter initialEntries={["/pacientes/pat-1"]}>
        <Routes>
          <Route path="/pacientes/:patientId" element={<PatientDetailPage />} />
        </Routes>
      </MemoryRouter>
    </AuthProvider>,
  );
}

const patient = {
  id: "pat-1",
  fullName: "Maria Silva",
  cpf: "39053344705",
  email: null,
  phone: null,
  active: true,
};

describe("PatientDetailPage", () => {
  it("carrega e exibe o paciente", async () => {
    renderDetail(sequencedFetch([jsonResponse(200, patient)]));
    await waitFor(() => expect(screen.getByText("Maria Silva")).toBeInTheDocument());
    expect(screen.getByText("CPF 39053344705")).toBeInTheDocument();
  });

  it("na aba prontuario, exige consentimento quando 451", async () => {
    const fetchImpl = sequencedFetch([
      jsonResponse(200, patient), // getById
      jsonResponse(451, { error: { code: "CONSENT_REQUIRED", message: "consent" } }), // list records
    ]);
    renderDetail(fetchImpl);
    await waitFor(() => screen.getByText("Maria Silva"));
    await userEvent.click(screen.getByRole("tab", { name: "Prontuário" }));
    await waitFor(() =>
      expect(
        screen.getByText("Consentimento do paciente necessário para acessar este dado."),
      ).toBeInTheDocument(),
    );
  });
});
