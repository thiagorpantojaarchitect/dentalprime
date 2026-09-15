/**
 * Configuracao do servico ai-front-desk. Segredos vem de variaveis de ambiente
 * em desenvolvimento e do AWS Secrets Manager em producao. Nao logamos valores.
 * As chaves dos fornecedores de IA (quando adaptadores reais forem usados)
 * tambem viriam do Secrets Manager em runtime.
 */

import { z } from "zod";

const configSchema = z
  .object({
    nodeEnv: z.enum(["development", "test", "production"]).default("development"),
    deploymentEnv: z
      .enum(["development", "staging", "production"])
      .default("development"),
    port: z.coerce.number().int().positive().default(3007),
    databaseUrl: z.string().min(1, "DATABASE_URL e obrigatoria"),
    jwtSecret: z.string().min(32, "JWT_SECRET deve ter ao menos 32 caracteres"),
    aiProvider: z.enum(["stub", "bedrock"]),
    bedrockRegion: z.string().min(1).default("sa-east-1"),
    bedrockModelId: z.string().min(1).optional(),
    bedrockMaxTokens: z.coerce.number().int().min(1).max(8192).default(1024),
    bedrockGuardrailId: z.string().min(1).optional(),
    bedrockGuardrailVersion: z.string().regex(/^\d+$/).optional(),
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
    if (config.aiProvider === "bedrock" && !config.bedrockModelId) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["bedrockModelId"],
        message: "BEDROCK_MODEL_ID e obrigatoria quando AI_PROVIDER=bedrock",
      });
    }
    if (config.aiProvider === "stub" && config.deploymentEnv !== "development") {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["aiProvider"],
        message: "AI_PROVIDER=stub e permitido apenas em development",
      });
    }
    if (Boolean(config.bedrockGuardrailId) !== Boolean(config.bedrockGuardrailVersion)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["bedrockGuardrailId"],
        message: "BEDROCK_GUARDRAIL_ID e VERSION devem ser informados juntos",
      });
    }
  });

export type Config = z.infer<typeof configSchema>;

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const parsed = configSchema.safeParse({
    nodeEnv: env.NODE_ENV,
    deploymentEnv: env.DEPLOYMENT_ENV,
    port: env.PORT,
    databaseUrl: env.DATABASE_URL,
    jwtSecret: env.JWT_SECRET,
    aiProvider: env.AI_PROVIDER,
    bedrockRegion: env.BEDROCK_REGION,
    bedrockModelId: env.BEDROCK_MODEL_ID,
    bedrockMaxTokens: env.BEDROCK_MAX_TOKENS,
    bedrockGuardrailId: env.BEDROCK_GUARDRAIL_ID,
    bedrockGuardrailVersion: env.BEDROCK_GUARDRAIL_VERSION,
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
