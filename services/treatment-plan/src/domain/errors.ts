/**
 * Erros de dominio do treatment-plan. Mesmo padrao dos demais servicos.
 */

export type DomainErrorCode =
  | "UNAUTHENTICATED"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "CONFLICT"
  | "VALIDATION"
  | "LICENSED_CODE_BLOCKED";

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

/**
 * Uso de codigo padronizado licenciado (ex.: CDT/ADA) sem acordo formal.
 * Bloqueado por conformidade juridica (ver PRD, limites juridicos).
 */
export class LicensedCodeBlockedError extends DomainError {
  constructor() {
    super(
      "LICENSED_CODE_BLOCKED",
      "Codigos padronizados licenciados exigem acordo formal e nao podem ser usados.",
    );
    this.name = "LicensedCodeBlockedError";
  }
}
