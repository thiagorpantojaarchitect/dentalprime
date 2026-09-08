/**
 * Erros de dominio do finance. Mesmo padrao dos demais servicos.
 */

export type DomainErrorCode =
  | "UNAUTHENTICATED"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "CONFLICT"
  | "VALIDATION"
  | "PAYMENT_EXCEEDS_BALANCE";

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

/** Pagamento maior que o saldo devedor da fatura. */
export class PaymentExceedsBalanceError extends DomainError {
  constructor() {
    super("PAYMENT_EXCEEDS_BALANCE", "Pagamento excede o saldo devedor da fatura.");
    this.name = "PaymentExceedsBalanceError";
  }
}
