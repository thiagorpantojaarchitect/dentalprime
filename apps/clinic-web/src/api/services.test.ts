import { describe, expect, it, vi } from "vitest";

import { ApiClient } from "./client.js";
import { SchedulingApi } from "./services.js";

const UNIT_ID = "11111111-1111-4111-8111-111111111111";
const USER_ID = "22222222-2222-4222-8222-222222222222";
const PROVIDER_ID = "33333333-3333-4333-8333-333333333333";
const RESOURCE_ID = "44444444-4444-4444-8444-444444444444";
const PATIENT_ID = "55555555-5555-4555-8555-555555555555";

function response(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function schedulingApi(fetchImpl: typeof fetch): SchedulingApi {
  return new SchedulingApi(
    new ApiClient({
      baseUrl: "https://schedule.example.test",
      getAccessToken: () => "access-token",
      fetchImpl,
    }),
  );
}

function requestBody(mock: ReturnType<typeof vi.fn>, index: number): unknown {
  const init = (mock.mock.calls[index] as unknown as [string, RequestInit])[1];
  return JSON.parse(init.body as string) as unknown;
}

describe("SchedulingApi", () => {
  it("lista e desembrulha profissionais e recursos da unidade", async () => {
    const fetchImpl = vi.fn(async (input: string | URL | Request) => {
      const url = String(input);
      if (url.includes("/providers?")) {
        return response({
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
      return response({
        resources: [
          { id: RESOURCE_ID, unitId: UNIT_ID, name: "Cadeira 1", kind: "chair" },
        ],
      });
    });
    const api = schedulingApi(fetchImpl as unknown as typeof fetch);

    await expect(api.listProviders(UNIT_ID)).resolves.toEqual([
      expect.objectContaining({ id: PROVIDER_ID, displayName: "Dra. Ana" }),
    ]);
    await expect(api.listResources(UNIT_ID)).resolves.toEqual([
      expect.objectContaining({ id: RESOURCE_ID, name: "Cadeira 1" }),
    ]);

    expect(fetchImpl.mock.calls[0]?.[0]).toBe(
      `https://schedule.example.test/providers?unitId=${UNIT_ID}`,
    );
    expect(fetchImpl.mock.calls[1]?.[0]).toBe(
      `https://schedule.example.test/resources?unitId=${UNIT_ID}`,
    );
  });

  it("envia os contratos de catálogo, disponibilidade e agendamento", async () => {
    const fetchImpl = vi.fn(async (input: string | URL | Request) => {
      const url = String(input);
      if (url.endsWith("/providers")) {
        return response(
          {
            id: PROVIDER_ID,
            unitId: UNIT_ID,
            userId: USER_ID,
            displayName: "Dra. Ana",
          },
          201,
        );
      }
      if (url.endsWith("/resources")) {
        return response(
          {
            id: RESOURCE_ID,
            unitId: UNIT_ID,
            name: "Cadeira 1",
            kind: "chair",
          },
          201,
        );
      }
      if (url.endsWith("/availability")) return response({ id: "window-1" }, 201);
      return response({ id: "appointment-1", status: "booked" }, 201);
    });
    const api = schedulingApi(fetchImpl as unknown as typeof fetch);

    await api.createProvider({
      unitId: UNIT_ID,
      userId: USER_ID,
      displayName: "Dra. Ana",
    });
    await api.createResource({ unitId: UNIT_ID, name: "Cadeira 1", kind: "chair" });
    await api.addAvailability({
      unitId: UNIT_ID,
      providerId: PROVIDER_ID,
      resourceId: RESOURCE_ID,
      kind: "available",
      startsAt: "2026-09-20T12:00:00.000Z",
      endsAt: "2026-09-20T13:00:00.000Z",
    });
    await api.book({
      unitId: UNIT_ID,
      patientId: PATIENT_ID,
      providerId: PROVIDER_ID,
      startsAt: "2026-09-20T12:00:00.000Z",
      endsAt: "2026-09-20T13:00:00.000Z",
    });

    expect(requestBody(fetchImpl, 0)).toEqual({
      unitId: UNIT_ID,
      userId: USER_ID,
      displayName: "Dra. Ana",
    });
    expect(requestBody(fetchImpl, 1)).toEqual({
      unitId: UNIT_ID,
      name: "Cadeira 1",
      kind: "chair",
    });
    expect(requestBody(fetchImpl, 2)).toEqual(
      expect.objectContaining({
        unitId: UNIT_ID,
        providerId: PROVIDER_ID,
        resourceId: RESOURCE_ID,
        kind: "available",
      }),
    );
    expect(requestBody(fetchImpl, 3)).toEqual({
      unitId: UNIT_ID,
      patientId: PATIENT_ID,
      providerId: PROVIDER_ID,
      startsAt: "2026-09-20T12:00:00.000Z",
      endsAt: "2026-09-20T13:00:00.000Z",
    });
    expect(requestBody(fetchImpl, 3)).not.toHaveProperty("resourceId");
  });
});
