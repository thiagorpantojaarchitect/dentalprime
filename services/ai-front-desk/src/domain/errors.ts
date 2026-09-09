/**
 * Erros de dominio do ai-front-desk. Mesmo padrao dos demais servicos.
 */

export type DomainErrorCode =
  | "UNAUTHENTICATED"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "CONFLICT"
  | "VALIDATION"
  | "CLINICAL_CONTENT_BLOCKED";

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

/**
 * Solicitacao de conteudo clinico (diagnostico/prescricao) para a IA. Bloqueado
 * por seguranca clinica; o fluxo recomenda handoff para um profissional.
 */
export class ClinicalContentBlockedError extends DomainError {
  constructor() {
    super(
      "CLINICAL_CONTENT_BLOCKED",
      "A recepcao por IA nao fornece diagnostico ou prescricao. Um profissional dara continuidade.",
    );
    this.name = "ClinicalContentBlockedError";
  }
}
