/**
 * Configuracao do servico e resolucao de segredos.
 *
 * Em desenvolvimento, os valores vem de variaveis de ambiente. Em producao, os
 * segredos (DATABASE_URL, JWT_SECRET) devem ser resolvidos do AWS Secrets
 * Manager em runtime e injetados como variaveis de ambiente pelo runtime da
 * task (ECS). Este modulo nao busca nem imprime valores de segredos.
 *
 * Ver `.kiro/steering/security-lgpd.md`.
 */

import { z } from "zod";

const configSchema = z.object({
  nodeEnv: z.enum(["development", "test", "production"]).default("development"),
  port: z.coerce.number().int().positive().default(3001),
  databaseUrl: z.string().min(1, "DATABASE_URL e obrigatoria"),
  // Segredo de assinatura dos JWT. Minimo de 32 bytes para HS256.
  jwtSecret: z.string().min(32, "JWT_SECRET deve ter ao menos 32 caracteres"),
  accessTokenTtlSeconds: z.coerce.number().int().positive().default(900),
  refreshTokenTtlSeconds: z.coerce
    .number()
    .int()
    .positive()
    .default(60 * 60 * 24 * 14),
  loginRateLimitPerMinute: z.coerce.number().int().positive().default(10),
});

export type Config = z.infer<typeof configSchema>;

/**
 * Le e valida a configuracao a partir de um objeto de ambiente.
 * Falha rapido (lanca) se um segredo obrigatorio estiver ausente ou invalido.
 * Nao registra os valores em log.
 */
export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const parsed = configSchema.safeParse({
    nodeEnv: env.NODE_ENV,
    port: env.PORT,
    databaseUrl: env.DATABASE_URL,
    jwtSecret: env.JWT_SECRET,
    accessTokenTtlSeconds: env.ACCESS_TOKEN_TTL_SECONDS,
    refreshTokenTtlSeconds: env.REFRESH_TOKEN_TTL_SECONDS,
    loginRateLimitPerMinute: env.LOGIN_RATE_LIMIT_PER_MINUTE,
  });

  if (!parsed.success) {
    // Reporta apenas os nomes das chaves com problema, nunca os valores.
    const invalidKeys = parsed.error.issues
      .map((issue) => issue.path.join("."))
      .join(", ");
    throw new Error(`Configuracao invalida. Verifique: ${invalidKeys}`);
  }

  return parsed.data;
}
