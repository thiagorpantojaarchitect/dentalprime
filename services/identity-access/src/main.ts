/**
 * Ponto de entrada do servico identity-access.
 *
 * Inicia a telemetria (OpenTelemetry) ANTES de carregar o app, para que as
 * bibliotecas (HTTP, pg, fastify) sejam instrumentadas no import. A telemetria e
 * no-op se OTEL_EXPORTER_OTLP_ENDPOINT nao estiver definido. Em seguida carrega
 * config, compoe dependencias de producao e inicia o servidor HTTP.
 */

import { startTelemetry } from "@dentalprime/observability";

async function main(): Promise<void> {
  const telemetry = startTelemetry({
    serviceName: "identity-access",
    environment: process.env.NODE_ENV,
  });

  // Import dinamico apos iniciar a telemetria (instrumentacao no momento certo).
  const [{ buildApp }, { composeProduction }, { loadConfig }] = await Promise.all([
    import("./app.js"),
    import("./composition.js"),
    import("./config.js"),
  ]);

  const config = loadConfig();
  const composition = composeProduction(config);
  const app = await buildApp(composition);

  const shutdown = async (): Promise<void> => {
    await app.close();
    await composition.connection.pool.end();
    await telemetry.shutdown();
  };
  process.on("SIGTERM", () => void shutdown());
  process.on("SIGINT", () => void shutdown());

  try {
    await app.listen({ port: config.port, host: "0.0.0.0" });
  } catch (error) {
    app.log.error(error);
    await shutdown();
    process.exit(1);
  }
}

void main();
