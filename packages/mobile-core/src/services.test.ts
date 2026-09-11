import { describe, it, expect, vi } from "vitest";

import { ApiClient } from "./api-client.js";
import { AuthApi, ClinicalApi, PatientSelfApi } from "./services.js";

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function clientWith(fetchImpl: typeof fetch): ApiClient {
  return new ApiClient({
    baseUrl: "http://api",
    getAccessToken: () => "token",
    fetchImpl,
  });
}

describe("AuthApi", () => {
  it("login envia credenciais como rota publica", async () => {
    const fetchImpl = vi.fn(async () =>
      jsonResponse(200, { accessToken: "a", refreshToken: "r" }),
    );
    const api = new AuthApi(clientWith(fetchImpl as unknown as typeof fetch));
    const pair = await api.login("t1", "user@x.com", "senha");
    expect(pair.accessToken).toBe("a");
    const [, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(init.headers).toMatchObject({ "content-type": "application/json" });
    // Rota publica: sem Authorization.
    expect((init.headers as Record<string, string>)["authorization"]).toBeUndefined();
  });
});

describe("PatientSelfApi", () => {
  it("le o proprio prontuario por id", async () => {
    const fetchImpl = vi.fn(async () =>
      jsonResponse(200, {
        id: "pat-1",
        fullName: "Maria",
        cpf: "1",
        email: null,
        phone: null,
        active: true,
      }),
    );
    const api = new PatientSelfApi(clientWith(fetchImpl as unknown as typeof fetch));
    const patient = await api.getMyRecord("pat-1");
    expect(patient.fullName).toBe("Maria");
  });

  it("lista as evolucoes desembrulhando o wrapper", async () => {
    const fetchImpl = vi.fn(async () =>
      jsonResponse(200, { records: [{ recordKey: "r1", version: 1 }] }),
    );
    const api = new PatientSelfApi(clientWith(fetchImpl as unknown as typeof fetch));
    const records = await api.listMyClinicalRecords("pat-1");
    expect(records).toHaveLength(1);
    expect(records[0]?.recordKey).toBe("r1");
  });
});

describe("ClinicalApi", () => {
  it("registra evolucao (append-only) via patient client", async () => {
    const patientFetch = vi.fn(async () =>
      jsonResponse(201, { recordKey: "r1", version: 1 }),
    );
    const schedulingFetch = vi.fn(async () => jsonResponse(200, {}));
    const api = new ClinicalApi(
      clientWith(patientFetch as unknown as typeof fetch),
      clientWith(schedulingFetch as unknown as typeof fetch),
    );
    const created = await api.addClinicalRecord("pat-1", "evolucao", "texto");
    expect(created.version).toBe(1);
    expect(patientFetch).toHaveBeenCalledTimes(1);
    expect(schedulingFetch).not.toHaveBeenCalled();
  });

  it("agenda via scheduling client", async () => {
    const patientFetch = vi.fn(async () => jsonResponse(200, {}));
    const schedulingFetch = vi.fn(async () =>
      jsonResponse(201, { id: "appt-1", status: "scheduled" }),
    );
    const api = new ClinicalApi(
      clientWith(patientFetch as unknown as typeof fetch),
      clientWith(schedulingFetch as unknown as typeof fetch),
    );
    const appt = await api.book({
      patientId: "pat-1",
      providerId: "prov-1",
      unitId: "unit-1",
      startsAt: "2026-01-01T10:00:00.000Z",
      endsAt: "2026-01-01T10:30:00.000Z",
    });
    expect(appt.status).toBe("scheduled");
    expect(schedulingFetch).toHaveBeenCalledTimes(1);
  });
});
