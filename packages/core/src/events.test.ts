import { describe, it, expect } from "vitest";
import { createDomainEvent, type DomainEvent } from "./events.js";

interface AppointmentBookedPayload {
  readonly appointmentId: string;
  readonly patientId: string;
}

describe("createDomainEvent", () => {
  it("preenche o envelope com os campos informados", () => {
    const event = createDomainEvent<"AppointmentBooked", AppointmentBookedPayload>({
      type: "AppointmentBooked",
      version: 1,
      tenantId: "tenant-001",
      payload: { appointmentId: "appt-1", patientId: "pat-1" },
      id: "evt-1",
      occurredAt: "2026-01-01T00:00:00.000Z",
    });

    const expected: DomainEvent<"AppointmentBooked", AppointmentBookedPayload> = {
      id: "evt-1",
      type: "AppointmentBooked",
      version: 1,
      tenantId: "tenant-001",
      occurredAt: "2026-01-01T00:00:00.000Z",
      payload: { appointmentId: "appt-1", patientId: "pat-1" },
    };
    expect(event).toEqual(expected);
  });

  it("gera id e occurredAt quando nao informados", () => {
    const event = createDomainEvent({
      type: "PaymentReceived",
      version: 1,
      tenantId: "tenant-001",
      payload: { amount: 100 },
    });

    expect(event.id).toMatch(/[0-9a-f-]{36}/);
    expect(Number.isNaN(Date.parse(event.occurredAt))).toBe(false);
  });
});
