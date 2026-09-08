/**
 * Erros de dominio do smart-scheduling. Mesmo padrao dos demais servicos.
 */

export type DomainErrorCode =
  | "UNAUTHENTICATED"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "CONFLICT"
  | "VALIDATION"
  | "SCHEDULE_CONFLICT";

export class DomainError extends Error {
  public readonly code: DomainErrorCode;

  constructor(code: DomainErrorCode, message: string) {
    super(message);
    this.name = "DomainError";
    this.code = code;
  }
}

export class UnauthenticatedError extends DomainError {
  constructor(message = "Autenticacao necessaria.") {
    super("UNAUTHENTICATED", message);
    this.name = "UnauthenticatedError";
  }
}

export class ForbiddenError extends DomainError {
  constructor(message = "Acesso negado.") {
    super("FORBIDDEN", message);
    this.name = "ForbiddenError";
  }
}

export class NotFoundError extends DomainError {
  constructor(message = "Recurso nao encontrado.") {
    super("NOT_FOUND", message);
    this.name = "NotFoundError";
  }
}

export class ValidationError extends DomainError {
  constructor(message = "Dados invalidos.") {
    super("VALIDATION", message);
    this.name = "ValidationError";
  }
}

/** Conflito de horario: sobreposicao com outro agendamento ou fora de disponibilidade. */
export class ScheduleConflictError extends DomainError {
  constructor(message = "Conflito de horario.") {
    super("SCHEDULE_CONFLICT", message);
    this.name = "ScheduleConflictError";
  }
}
