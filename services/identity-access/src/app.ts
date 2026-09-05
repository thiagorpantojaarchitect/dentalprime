/**
 * Fabrica do aplicativo Fastify do identity-access.
 *
 * Monta o app com os servicos injetados. Recebe as dependencias prontas para
 * facilitar testes (injecao de repositorios em memoria) e producao (Drizzle).
 */

import rateLimit from "@fastify/rate-limit";
import Fastify, { type FastifyInstance } from "fastify";

import type { AuthService } from "./application/auth-service.js";
import type { TokenService } from "./application/tokens.js";
import type { UserService } from "./application/user-service.js";
import { authPlugin } from "./api/auth-plugin.js";
import { sendError } from "./api/errors.js";
import { registerRoutes } from "./api/routes.js";

export interface AppDeps {
  readonly auth: AuthService;
  readonly users: UserService;
  readonly tokens: TokenService;
  readonly loginRateLimitPerMinute: number;
}

export async function buildApp(deps: AppDeps): Promise<FastifyInstance> {
  const app = Fastify({
    logger: { level: process.env.LOG_LEVEL ?? "info" },
    // Nao logar corpo de requisicao para evitar vazamento de credenciais/PII.
    disableRequestLogging: false,
  });

  // Handler global de erros: mapeia erros de dominio (inclusive os lancados em
  // preHandlers, como o de autenticacao) para respostas HTTP seguras.
  app.setErrorHandler((error, _request, reply) => {
    return sendError(reply, error);
  });

  await app.register(rateLimit, { global: false });
  await app.register(authPlugin, { tokens: deps.tokens });

  await app.register(async (instance) => {
    await registerRoutes(instance, {
      auth: deps.auth,
      users: deps.users,
      loginRateLimitPerMinute: deps.loginRateLimitPerMinute,
    });
  });

  return app;
}
