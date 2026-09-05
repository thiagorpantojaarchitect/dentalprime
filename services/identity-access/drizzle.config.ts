import { defineConfig } from "drizzle-kit";

/**
 * Configuracao do drizzle-kit para gerar migracoes SQL a partir do schema.
 * A connection string so e necessaria para comandos que tocam o banco.
 */
export default defineConfig({
  dialect: "postgresql",
  schema: "./src/infrastructure/db/schema.ts",
  out: "./drizzle",
  dbCredentials: {
    url: process.env.DATABASE_URL ?? "postgres://localhost:5432/dentalprime",
  },
});
