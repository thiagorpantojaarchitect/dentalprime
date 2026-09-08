/**
 * Configuracao do servico finance. Segredos vem de variaveis de ambiente em
 * desenvolvimento e do AWS Secrets Manager em producao. Nao logamos valores.
 * Chaves de gateway de pagamento tambem viriam do Secrets Manager em runtime.
 */

import { z } from "zod";

const configSchema = z.object({
  nodeEnv: z.enum(["development", "test", "production"]).default("development"),
  port: z.coerce.number().int().positive().default(3005),
  databaseUrl: z.string().min(1, "DATABASE_URL e obrigatoria"),
  jwtSecret: z.string().min(32, "JWT_SECRET deve ter ao menos 32 caracteres"),
  // Moeda padrao do tenant (ISO 4217). BRL para o mercado brasileiro.
  defaultCurrency: z.string().length(3).default("BRL"),
});

export type Config = z.infer<typeof configSchema>;

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const parsed = configSchema.safeParse({
    nodeEnv: env.NODE_ENV,
    port: env.PORT,
    databaseUrl: env.DATABASE_URL,
    jwtSecret: env.JWT_SECRET,
    defaultCurrency: env.DEFAULT_CURRENCY,
  });

  if (!parsed.success) {
    const invalidKeys = parsed.error.issues
      .map((issue) => issue.path.join("."))
      .join(", ");
    throw new Error(`Configuracao invalida. Verifique: ${invalidKeys}`);
  }

  return parsed.data;
}
