/**
 * Fabrica do aplicativo Fastify do ai-front-desk.
 */

import Fastify, { type FastifyInstance } from "fastify";

import { authPlugin } from "./api/auth-plugin.js";
import { sendError } from "./api/errors.js";
import { registerRoutes, type RouteServices } from "./api/routes.js";

export interface AppDeps extends RouteServices {
  readonly jwtSecret: string;
}

export async function buildApp(deps: AppDeps): Promise<FastifyInstance> {
  const app = Fastify({
    logger: { level: process.env.LOG_LEVEL ?? "info" },
  });

  app.setErrorHandler((error, _request, reply) => sendError(reply, error));

  await app.register(authPlugin, { jwtSecret: deps.jwtSecret });

  await app.register(async (instance) => {
    await registerRoutes(instance, {
      conversations: deps.conversations,
      handoffs: deps.handoffs,
      suggestions: deps.suggestions,
    });
  });

  return app;
}
