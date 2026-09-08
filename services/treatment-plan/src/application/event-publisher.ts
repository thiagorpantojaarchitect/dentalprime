/**
 * Publicador de eventos de dominio do treatment-plan.
 *
 * Abstrai o destino (EventBridge em producao; coletor em memoria nos testes).
 * Eventos usam o envelope versionado de `@dentalprime/core`. O evento
 * TreatmentItemAccepted e consumido pelo modulo finance para gerar cobranca.
 */

import { createDomainEvent, type DomainEvent, type TenantId } from "@dentalprime/core";

export interface EventPublisher {
  publish(event: DomainEvent<string, unknown>): Promise<void>;
}

export class InMemoryEventPublisher implements EventPublisher {
  public readonly events: Array<DomainEvent<string, unknown>> = [];

  async publish(event: DomainEvent<string, unknown>): Promise<void> {
    this.events.push(event);
  }
}

export class NoopEventPublisher implements EventPublisher {
  async publish(): Promise<void> {
    // intencionalmente vazio
  }
}

export interface PlanCreatedPayload {
  readonly planKey: string;
  readonly patientId: string;
  readonly version: number;
}

export interface ItemAcceptedPayload {
  readonly planKey: string;
  readonly itemId: string;
  readonly procedureId: string;
  readonly estimatedCost: string;
}

export interface ItemCompletedPayload {
  readonly planKey: string;
  readonly itemId: string;
}

export function planCreatedEvent(
  tenantId: TenantId,
  payload: PlanCreatedPayload,
): DomainEvent<"TreatmentPlanCreated", PlanCreatedPayload> {
  return createDomainEvent({
    type: "TreatmentPlanCreated",
    version: 1,
    tenantId,
    payload,
  });
}

export function itemAcceptedEvent(
  tenantId: TenantId,
  payload: ItemAcceptedPayload,
): DomainEvent<"TreatmentItemAccepted", ItemAcceptedPayload> {
  return createDomainEvent({
    type: "TreatmentItemAccepted",
    version: 1,
    tenantId,
    payload,
  });
}

export function itemCompletedEvent(
  tenantId: TenantId,
  payload: ItemCompletedPayload,
): DomainEvent<"TreatmentItemCompleted", ItemCompletedPayload> {
  return createDomainEvent({
    type: "TreatmentItemCompleted",
    version: 1,
    tenantId,
    payload,
  });
}
