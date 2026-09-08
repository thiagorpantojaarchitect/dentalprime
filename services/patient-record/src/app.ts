/**
 * Fabrica do aplicativo Fastify do patient-record. Recebe servicos injetados
 * (facilita teste com repositorios em memoria e producao com Drizzle).
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

  // Handler global de erros: mapeia erros de dominio (inclusive de preHandlers)
  // para respostas HTTP seguras.
  app.setErrorHandler((error, _request, reply) => sendError(reply, error));

  await app.register(authPlugin, { jwtSecret: deps.jwtSecret });

  await app.register(async (instance) => {
    await registerRoutes(instance, {
      patients: deps.patients,
      consents: deps.consents,
      records: deps.records,
      anamnesis: deps.anamnesis,
      odontogram: deps.odontogram,
      rights: deps.rights,
    });
  });

  return app;
}
