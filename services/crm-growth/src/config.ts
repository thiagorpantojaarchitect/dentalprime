/**
 * Configuracao do servico crm-growth. Segredos vem de variaveis de ambiente em
 * desenvolvimento e do AWS Secrets Manager em producao. Nao logamos valores.
 */

import { z } from "zod";

const configSchema = z
  .object({
    nodeEnv: z.enum(["development", "test", "production"]).default("development"),
    port: z.coerce.number().int().positive().default(3006),
    databaseUrl: z.string().min(1, "DATABASE_URL e obrigatoria"),
    jwtSecret: z.string().min(32, "JWT_SECRET deve ter ao menos 32 caracteres"),
    trustProxy: z.coerce.number().int().min(0).max(2).default(0),
  })
  .superRefine((config, context) => {
    if (config.nodeEnv === "production" && config.trustProxy !== 2) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["trustProxy"],
        message: "TRUST_PROXY deve ser 2 em producao (CloudFront + ALB)",
      });
    }
  });

export type Config = z.infer<typeof configSchema>;

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const parsed = configSchema.safeParse({
    nodeEnv: env.NODE_ENV,
    port: env.PORT,
    databaseUrl: env.DATABASE_URL,
    jwtSecret: env.JWT_SECRET,
    trustProxy: env.TRUST_PROXY,
  });

  if (!parsed.success) {
    const invalidKeys = parsed.error.issues
      .map((issue) => issue.path.join("."))
      .join(", ");
    throw new Error(`Configuracao invalida. Verifique: ${invalidKeys}`);
  }

  return parsed.data;
}
