/**
 * Ponto de entrada do servico treatment-plan.
 */

import { buildApp } from "./app.js";
import { composeProduction } from "./composition.js";
import { loadConfig } from "./config.js";

async function main(): Promise<void> {
  const config = loadConfig();
  const composition = composeProduction(config);
  const app = await buildApp(composition);

  try {
    await app.listen({ port: config.port, host: "0.0.0.0" });
  } catch (error) {
    app.log.error(error);
    await composition.connection.pool.end();
    process.exit(1);
  }
}

void main();
