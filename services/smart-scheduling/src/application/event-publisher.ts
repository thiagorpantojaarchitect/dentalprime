/**
 * Publicador de eventos de dominio.
 *
 * Abstrai o destino (EventBridge em producao; coletor em memoria nos testes).
 * Os eventos usam o envelope versionado de `@dentalprime/core`.
 */

import { createDomainEvent, type DomainEvent, type TenantId } from "@dentalprime/core";

export interface EventPublisher {
  publish(event: DomainEvent<string, unknown>): Promise<void>;
}

/** Publicador em memoria, util para testes e desenvolvimento local. */
export class InMemoryEventPublisher implements EventPublisher {
  public readonly events: Array<DomainEvent<string, unknown>> = [];

  async publish(event: DomainEvent<string, unknown>): Promise<void> {
    this.events.push(event);
  }
}

/** Publicador nulo (descarta eventos), para cenarios sem barramento. */
export class NoopEventPublisher implements EventPublisher {
  async publish(): Promise<void> {
    // intencionalmente vazio
  }
}

export interface AppointmentEventPayload {
  readonly appointmentId: string;
  readonly patientId: string;
  readonly providerId: string;
  readonly startsAt: string;
}

/** Cria um evento de agenda versionado (versao 1). */
export function appointmentEvent(
  type:
    | "AppointmentBooked"
    | "AppointmentConfirmed"
    | "AppointmentCancelled"
    | "AppointmentNoShow",
  tenantId: TenantId,
  payload: AppointmentEventPayload,
): DomainEvent<typeof type, AppointmentEventPayload> {
  return createDomainEvent({ type, version: 1, tenantId, payload });
}
