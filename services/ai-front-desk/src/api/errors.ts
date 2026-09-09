/**
 * Mapeamento de erros de dominio para respostas HTTP seguras.
 */

import type { FastifyReply } from "fastify";

import { DomainError } from "../domain/errors.js";

const STATUS_BY_CODE: Record<string, number> = {
  UNAUTHENTICATED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  VALIDATION: 400,
  CLINICAL_CONTENT_BLOCKED: 422,
};

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
