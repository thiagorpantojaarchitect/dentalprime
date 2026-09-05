/**
 * Plugin de autenticacao Fastify.
 *
 * Decora as requisicoes com `authenticate`, que valida o access token JWT do
 * header Authorization e injeta o `TenantContext` em `request.tenantContext`.
 */

import type { TenantContext } from "@dentalprime/core";
import type { FastifyPluginAsync, FastifyRequest } from "fastify";
import fp from "fastify-plugin";

import { UnauthenticatedError } from "../domain/errors.js";
import type { TokenService } from "../application/tokens.js";

declare module "fastify" {
  interface FastifyRequest {
    tenantContext?: TenantContext;
  }
  interface FastifyInstance {
    authenticate: (request: FastifyRequest) => Promise<void>;
  }
}

export interface AuthPluginOptions {
  readonly tokens: TokenService;
}

const plugin: FastifyPluginAsync<AuthPluginOptions> = async (fastify, opts) => {
  fastify.decorate("authenticate", async (request: FastifyRequest): Promise<void> => {
    const header = request.headers.authorization;
    if (!header || !header.startsWith("Bearer ")) {
      throw new UnauthenticatedError();
    }
    const token = header.slice("Bearer ".length).trim();
    try {
      const claims = await opts.tokens.verifyAccessToken(token);
      request.tenantContext = {
        tenantId: claims.tenantId,
        userId: claims.sub,
        roles: claims.roles,
        units: claims.units,
      };
    } catch {
      throw new UnauthenticatedError("Token invalido ou expirado.");
    }
  });
};

export const authPlugin = fp(plugin, { name: "auth-plugin" });

/** Recupera o contexto autenticado, lancando se ausente. */
export function requireContext(request: FastifyRequest): TenantContext {
  if (!request.tenantContext) {
    throw new UnauthenticatedError();
  }
  return request.tenantContext;
}
