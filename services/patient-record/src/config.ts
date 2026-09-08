/**
 * Configuracao do servico patient-record.
 *
 * Segredos vem de variaveis de ambiente em desenvolvimento e do AWS Secrets
 * Manager em producao (injetados no runtime da task). Nao logamos valores.
 */

import { z } from "zod";

const configSchema = z.object({
  nodeEnv: z.enum(["development", "test", "production"]).default("development"),
  port: z.coerce.number().int().positive().default(3002),
  databaseUrl: z.string().min(1, "DATABASE_URL e obrigatoria"),
  // Mesmo segredo de assinatura usado para validar o access token emitido pelo
  // identity-access. Em producao vem do Secrets Manager.
  jwtSecret: z.string().min(32, "JWT_SECRET deve ter ao menos 32 caracteres"),
});

export type Config = z.infer<typeof configSchema>;

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const parsed = configSchema.safeParse({
    nodeEnv: env.NODE_ENV,
    port: env.PORT,
    databaseUrl: env.DATABASE_URL,
    jwtSecret: env.JWT_SECRET,
  });

  if (!parsed.success) {
    const invalidKeys = parsed.error.issues
      .map((issue) => issue.path.join("."))
      .join(", ");
    throw new Error(`Configuracao invalida. Verifique: ${invalidKeys}`);
  }

  return parsed.data;
}
