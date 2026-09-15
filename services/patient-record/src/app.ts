/**
 * Fabrica do aplicativo Fastify do patient-record. Recebe servicos injetados
 * (facilita teste com repositorios em memoria e producao com Drizzle).
 */

import { trustProxyForHops } from "@dentalprime/core";
import Fastify, { type FastifyInstance } from "fastify";

import { authPlugin } from "./api/auth-plugin.js";
import { sendError } from "./api/errors.js";
import { registerRoutes, type RouteServices } from "./api/routes.js";

export interface AppDeps extends RouteServices {
  readonly jwtSecret: string;
  readonly trustProxy?: number;
  readonly readinessCheck?: () => Promise<void>;
}

export async function buildApp(deps: AppDeps): Promise<FastifyInstance> {
  const app = Fastify({
    logger: { level: process.env.LOG_LEVEL ?? "info" },
    trustProxy: trustProxyForHops(deps.trustProxy ?? 0),
  });

  // Handler global de erros: mapeia erros de dominio (inclusive de preHandlers)
  // para respostas HTTP seguras.
  app.setErrorHandler((error, _request, reply) => sendError(reply, error));

  await app.register(authPlugin, { jwtSecret: deps.jwtSecret });

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
      patients: deps.patients,
      consents: deps.consents,
      records: deps.records,
      anamnesis: deps.anamnesis,
      odontogram: deps.odontogram,
      rights: deps.rights,
      documents: deps.documents,
    });
  });

  return app;
}
