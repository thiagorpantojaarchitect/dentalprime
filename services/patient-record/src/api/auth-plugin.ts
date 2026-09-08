/**
 * Plugin de autenticacao Fastify do patient-record.
 *
 * Valida o access token JWT (emitido pelo identity-access, assinado com o mesmo
 * segredo) e injeta o TenantContext em `request.tenantContext`. Este servico nao
 * emite tokens; apenas os verifica.
 */

import type { ClinicUnitId, Role, TenantContext } from "@dentalprime/core";
import type { FastifyPluginAsync, FastifyRequest } from "fastify";
import fp from "fastify-plugin";
import { jwtVerify, type JWTPayload } from "jose";

import { UnauthenticatedError } from "../domain/errors.js";

declare module "fastify" {
  interface FastifyRequest {
    tenantContext?: TenantContext;
  }
  interface FastifyInstance {
    authenticate: (request: FastifyRequest) => Promise<void>;
  }
}

export interface AuthPluginOptions {
  readonly jwtSecret: string;
  readonly issuer?: string;
}

const plugin: FastifyPluginAsync<AuthPluginOptions> = async (fastify, opts) => {
  const key = new TextEncoder().encode(opts.jwtSecret);
  const issuer = opts.issuer ?? "dentalprime-identity-access";

  fastify.decorate("authenticate", async (request: FastifyRequest): Promise<void> => {
    const header = request.headers.authorization;
    if (!header || !header.startsWith("Bearer ")) {
      throw new UnauthenticatedError();
    }
    const token = header.slice("Bearer ".length).trim();
    try {
      const { payload } = await jwtVerify(token, key, { issuer });
      request.tenantContext = toContext(payload);
    } catch {
      throw new UnauthenticatedError("Token invalido ou expirado.");
    }
  });
};

function toContext(payload: JWTPayload): TenantContext {
  const sub = payload.sub;
  const tenantId = payload["tenantId"];
  const roles = payload["roles"];
  const units = payload["units"];
  if (typeof sub !== "string" || typeof tenantId !== "string") {
    throw new UnauthenticatedError("Token invalido.");
  }
  return {
    tenantId,
    userId: sub,
    roles: Array.isArray(roles) ? (roles as Role[]) : [],
    units: Array.isArray(units) ? (units as ClinicUnitId[]) : [],
  };
}

export const authPlugin = fp(plugin, { name: "auth-plugin" });

export function requireContext(request: FastifyRequest): TenantContext {
  if (!request.tenantContext) {
    throw new UnauthenticatedError();
  }
  return request.tenantContext;
}
