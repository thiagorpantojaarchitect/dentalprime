/**
 * Contrato base de eventos de dominio.
 *
 * Dominios se comunicam preferencialmente de forma assincrona por eventos
 * (EventBridge/SQS). Todo evento e versionado, carrega o `tenantId` para
 * isolamento e nao deve conter segredos nem PII sensivel alem do necessario.
 *
 * Ver `.kiro/steering/architecture.md`.
 */

import { randomUUID } from "node:crypto";

import type { TenantId } from "./tenant.js";

/**
 * Envelope comum a todos os eventos de dominio.
 *
 * @typeParam TType - nome do tipo do evento (ex.: "AppointmentBooked").
 * @typeParam TPayload - dados especificos do evento.
 */
export interface DomainEvent<TType extends string, TPayload> {
  /** Identificador unico do evento. */
  readonly id: string;
  /** Nome do tipo do evento. */
  readonly type: TType;
  /** Versao do contrato do evento. Mudancas incompativeis incrementam a versao. */
  readonly version: number;
  /** Tenant ao qual o evento pertence. */
  readonly tenantId: TenantId;
  /** Momento de ocorrencia, em ISO 8601 (UTC). */
  readonly occurredAt: string;
  /** Dados especificos do evento. */
  readonly payload: TPayload;
}

/** Parametros para criar um evento; id e occurredAt sao gerados. */
export interface CreateDomainEventInput<TType extends string, TPayload> {
  readonly type: TType;
  readonly version: number;
  readonly tenantId: TenantId;
  readonly payload: TPayload;
  /** Injecao opcional para testes deterministicos. */
  readonly id?: string;
  readonly occurredAt?: string;
}

/**
 * Cria um evento de dominio com envelope padrao.
 *
 * Gera `id` e `occurredAt` quando nao informados. Aceita injecao desses valores
 * para testes deterministicos.
 */
export function createDomainEvent<TType extends string, TPayload>(
  input: CreateDomainEventInput<TType, TPayload>,
): DomainEvent<TType, TPayload> {
  return {
    id: input.id ?? randomUUID(),
    type: input.type,
    version: input.version,
    tenantId: input.tenantId,
    occurredAt: input.occurredAt ?? new Date().toISOString(),
    payload: input.payload,
  };
}
