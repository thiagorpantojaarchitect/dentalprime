/**
 * Erros de dominio do identity-access.
 *
 * Erros nao vazam detalhes sensiveis nem stack traces ao cliente. A camada de
 * API mapeia cada erro para um status HTTP e uma mensagem segura.
 */

export type DomainErrorCode =
  | "INVALID_CREDENTIALS"
  | "UNAUTHENTICATED"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "CONFLICT"
  | "VALIDATION"
  | "TENANT_MISMATCH";

export class DomainError extends Error {
  public readonly code: DomainErrorCode;

  constructor(code: DomainErrorCode, message: string) {
    super(message);
    this.name = "DomainError";
    this.code = code;
  }
}

/** Credenciais invalidas. Mensagem generica para nao revelar o fator que falhou. */
export class InvalidCredentialsError extends DomainError {
  constructor() {
    super("INVALID_CREDENTIALS", "Credenciais invalidas.");
    this.name = "InvalidCredentialsError";
  }
}

/** Requisicao sem autenticacao valida. */
export class UnauthenticatedError extends DomainError {
  constructor(message = "Autenticacao necessaria.") {
    super("UNAUTHENTICATED", message);
    this.name = "UnauthenticatedError";
  }
}

/** Usuario autenticado sem permissao para a acao. */
export class ForbiddenError extends DomainError {
  constructor(message = "Acesso negado.") {
    super("FORBIDDEN", message);
    this.name = "ForbiddenError";
  }
}

/** Recurso nao encontrado no escopo do tenant. */
export class NotFoundError extends DomainError {
  constructor(message = "Recurso nao encontrado.") {
    super("NOT_FOUND", message);
    this.name = "NotFoundError";
  }
}

/** Violacao de unicidade ou estado conflitante. */
export class ConflictError extends DomainError {
  constructor(message = "Conflito de estado.") {
    super("CONFLICT", message);
    this.name = "ConflictError";
  }
}

/**
 * Tentativa de acessar dado de outro tenant. Tratado como negacao e auditado.
 */
export class TenantMismatchError extends DomainError {
  constructor() {
    super("TENANT_MISMATCH", "Acesso negado: recurso de outro tenant.");
    this.name = "TenantMismatchError";
  }
}
