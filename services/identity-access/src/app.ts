/**
 * Fabrica do aplicativo Fastify do identity-access.
 *
 * Monta o app com os servicos injetados. Recebe as dependencias prontas para
 * facilitar testes (injecao de repositorios em memoria) e producao (Drizzle).
 */

import rateLimit from "@fastify/rate-limit";
import { trustProxyForHops } from "@dentalprime/core";
import Fastify, { type FastifyInstance } from "fastify";

import type { AuthService } from "./application/auth-service.js";
import type { NetworkService } from "./application/network-service.js";
import type { TokenService } from "./application/tokens.js";
import type { UserService } from "./application/user-service.js";
import { authPlugin } from "./api/auth-plugin.js";
import { sendError } from "./api/errors.js";
import { registerRoutes } from "./api/routes.js";

export interface AppDeps {
  readonly auth: AuthService;
  readonly users: UserService;
  readonly network: NetworkService;
  readonly tokens: TokenService;
  readonly loginRateLimitPerMinute: number;
  readonly trustProxy?: number;
  readonly readinessCheck?: () => Promise<void>;
  readonly rateLimitRedis?: unknown;
}

export async function buildApp(deps: AppDeps): Promise<FastifyInstance> {
  const app = Fastify({
    // Fastify nao inclui corpo/credenciais nos logs de request padrao.
    logger: { level: process.env.LOG_LEVEL ?? "info" },
    trustProxy: trustProxyForHops(deps.trustProxy ?? 0),
  });

  // Handler global de erros: mapeia erros de dominio (inclusive os lancados em
  // preHandlers, como o de autenticacao) para respostas HTTP seguras.
  app.setErrorHandler((error, _request, reply) => {
    return sendError(reply, error);
  });

  await app.register(rateLimit, { global: false, redis: deps.rateLimitRedis });
  await app.register(authPlugin, { tokens: deps.tokens });

  app.get("/ready", async (_request, reply) => {
    try {
      await deps.readinessCheck?.();
      return reply.send({ status: "ready" });
    } catch {
      return reply.status(503).send({ status: "unavailable" });
    }
  });

  await app.register(async (instance) => {
    await registerRoutes(instance, {
      auth: deps.auth,
      users: deps.users,
      network: deps.network,
      loginRateLimitPerMinute: deps.loginRateLimitPerMinute,
    });
  });

  return app;
}
