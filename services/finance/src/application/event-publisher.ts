/**
 * Publicador de eventos de dominio do finance. Publica InvoiceIssued e
 * PaymentReceived (versionados). O consumo de TreatmentItemAccepted (vindo do
 * treatment-plan) e feito pelo InvoiceService via handleTreatmentItemAccepted.
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

export interface InvoiceIssuedPayload {
  readonly invoiceId: string;
  readonly patientId: string;
  readonly amountCents: number;
}

export interface PaymentReceivedPayload {
  readonly invoiceId: string;
  readonly paymentId: string;
  readonly amountCents: number;
  readonly balanceCents: number;
}

export function invoiceIssuedEvent(
  tenantId: TenantId,
  payload: InvoiceIssuedPayload,
): DomainEvent<"InvoiceIssued", InvoiceIssuedPayload> {
  return createDomainEvent({ type: "InvoiceIssued", version: 1, tenantId, payload });
}

export function paymentReceivedEvent(
  tenantId: TenantId,
  payload: PaymentReceivedPayload,
): DomainEvent<"PaymentReceived", PaymentReceivedPayload> {
  return createDomainEvent({ type: "PaymentReceived", version: 1, tenantId, payload });
}
