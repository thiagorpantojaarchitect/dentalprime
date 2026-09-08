/**
 * Erros de dominio do patient-record. Mesmo padrao do identity-access: erros
 * conhecidos viram status HTTP especifico e mensagem segura, sem vazar PII nem
 * detalhes internos.
 */

export type DomainErrorCode =
  | "UNAUTHENTICATED"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "CONFLICT"
  | "VALIDATION"
  | "CONSENT_REQUIRED";

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

export class ConflictError extends DomainError {
  constructor(message = "Conflito de estado.") {
    super("CONFLICT", message);
    this.name = "ConflictError";
  }
}

export class ValidationError extends DomainError {
  constructor(message = "Dados invalidos.") {
    super("VALIDATION", message);
    this.name = "ValidationError";
  }
}

/** Operacao bloqueada por falta de base legal/consentimento aplicavel (LGPD). */
export class ConsentRequiredError extends DomainError {
  constructor(purpose: string) {
    super("CONSENT_REQUIRED", `Consentimento necessario para a finalidade: ${purpose}.`);
    this.name = "ConsentRequiredError";
  }
}
