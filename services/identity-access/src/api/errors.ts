/**
 * Mapeamento de erros de dominio para respostas HTTP seguras.
 *
 * As mensagens ao cliente sao genericas e nao vazam detalhes internos, PII nem
 * stack traces.
 */

import type { FastifyReply } from "fastify";

import { DomainError } from "../domain/errors.js";

const STATUS_BY_CODE: Record<string, number> = {
  INVALID_CREDENTIALS: 401,
  UNAUTHENTICATED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  VALIDATION: 400,
  TENANT_MISMATCH: 403,
};

/**
 * Envia a resposta apropriada para um erro. Erros de dominio conhecidos viram
 * status especifico; qualquer outro vira 500 generico.
 */
export function sendError(reply: FastifyReply, error: unknown): FastifyReply {
  if (error instanceof DomainError) {
    const status = STATUS_BY_CODE[error.code] ?? 400;
    return reply
      .status(status)
      .send({ error: { code: error.code, message: error.message } });
  }
  reply.log.error(error);
  return reply
    .status(500)
    .send({ error: { code: "INTERNAL", message: "Erro interno." } });
}
