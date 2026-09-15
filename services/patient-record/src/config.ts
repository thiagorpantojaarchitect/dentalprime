/**
 * Configuracao do servico patient-record.
 *
 * Segredos vem de variaveis de ambiente em desenvolvimento e do AWS Secrets
 * Manager em producao (injetados no runtime da task). Nao logamos valores.
 */

import { z } from "zod";

const configSchema = z
  .object({
    nodeEnv: z.enum(["development", "test", "production"]).default("development"),
    port: z.coerce.number().int().positive().default(3002),
    databaseUrl: z.string().min(1, "DATABASE_URL e obrigatoria"),
    // Mesmo segredo de assinatura usado para validar o access token emitido pelo
    // identity-access. Em producao vem do Secrets Manager.
    jwtSecret: z.string().min(32, "JWT_SECRET deve ter ao menos 32 caracteres"),
    trustProxy: z.coerce.number().int().min(0).max(2).default(0),
    clinicalDocumentsBucket: z.string().min(3, "CLINICAL_DOCUMENTS_BUCKET e obrigatoria"),
    clinicalDocumentsEndpoint: z.string().url().optional(),
    clinicalDocumentsForcePathStyle: z
      .enum(["true", "false"])
      .default("false")
      .transform((value) => value === "true"),
    clinicalDocumentMaxBytes: z.coerce
      .number()
      .int()
      .positive()
      .default(25 * 1024 * 1024),
    presignedUrlTtlSeconds: z.coerce.number().int().min(60).max(3600).default(900),
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
    if (config.nodeEnv === "production" && config.clinicalDocumentsEndpoint) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["clinicalDocumentsEndpoint"],
        message: "Endpoint S3 customizado e bloqueado em producao",
      });
    }
  });

export type Config = z.infer<typeof configSchema>;

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const nodeEnv = env.NODE_ENV ?? "development";
  const parsed = configSchema.safeParse({
    nodeEnv,
    port: env.PORT,
    databaseUrl: env.DATABASE_URL,
    jwtSecret: env.JWT_SECRET,
    trustProxy: env.TRUST_PROXY,
    clinicalDocumentsBucket:
      env.CLINICAL_DOCUMENTS_BUCKET ??
      (nodeEnv === "production"
        ? undefined
        : "dentalprime-clinical-documents-development"),
    clinicalDocumentsEndpoint: env.CLINICAL_DOCUMENTS_ENDPOINT,
    clinicalDocumentsForcePathStyle: env.CLINICAL_DOCUMENTS_FORCE_PATH_STYLE,
    clinicalDocumentMaxBytes: env.CLINICAL_DOCUMENT_MAX_BYTES,
    presignedUrlTtlSeconds: env.PRESIGNED_URL_TTL_SECONDS,
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
