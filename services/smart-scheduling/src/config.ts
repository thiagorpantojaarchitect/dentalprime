/**
 * Configuracao do servico smart-scheduling. Segredos vem de variaveis de
 * ambiente em desenvolvimento e do AWS Secrets Manager em producao. Nao logamos
 * valores.
 */

import { z } from "zod";

const configSchema = z
  .object({
    nodeEnv: z.enum(["development", "test", "production"]).default("development"),
    deploymentEnv: z
      .enum(["development", "staging", "production"])
      .default("development"),
    port: z.coerce.number().int().positive().default(3003),
    databaseUrl: z.string().min(1, "DATABASE_URL e obrigatoria"),
    // Mesmo segredo usado para validar o access token emitido pelo identity-access.
    jwtSecret: z.string().min(32, "JWT_SECRET deve ter ao menos 32 caracteres"),
    trustProxy: z.coerce.number().int().min(0).max(2).default(0),
    eventProvider: z.enum(["noop", "eventbridge"]),
    eventBusName: z.string().min(1).optional(),
    awsRegion: z.string().min(1).default("sa-east-1"),
  })
  .superRefine((config, context) => {
    if (config.nodeEnv === "production" && config.trustProxy !== 2) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["trustProxy"],
        message: "TRUST_PROXY deve ser 2 em producao (CloudFront + ALB)",
      });
    }
    if (config.eventProvider === "noop" && config.deploymentEnv !== "development") {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["eventProvider"],
        message: "EVENT_PROVIDER=noop e permitido somente em development",
      });
    }
    if (config.eventProvider === "eventbridge" && !config.eventBusName) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["eventBusName"],
        message: "EVENT_BUS_NAME e obrigatoria para EventBridge",
      });
    }
  });

export type Config = z.infer<typeof configSchema>;

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const deploymentEnv = env.DEPLOYMENT_ENV ?? "development";
  const eventProvider =
    env.EVENT_PROVIDER ??
    (env.EVENT_BUS_NAME || deploymentEnv !== "development" ? "eventbridge" : "noop");
  const parsed = configSchema.safeParse({
    nodeEnv: env.NODE_ENV,
    deploymentEnv,
    port: env.PORT,
    databaseUrl: env.DATABASE_URL,
    jwtSecret: env.JWT_SECRET,
    trustProxy: env.TRUST_PROXY,
    eventProvider,
    eventBusName: env.EVENT_BUS_NAME,
    awsRegion: env.AWS_REGION,
  });

  if (!parsed.success) {
    const invalidKeys = parsed.error.issues
      .map((issue) => issue.path.join("."))
      .join(", ");
    throw new Error(`Configuracao invalida. Verifique: ${invalidKeys}`);
  }

  return parsed.data;
}
