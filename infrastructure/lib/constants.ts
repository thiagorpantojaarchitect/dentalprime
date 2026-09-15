/**
 * Constantes compartilhadas da infraestrutura.
 *
 * A regiao primaria e sa-east-1 (Sao Paulo), atendendo a residencia de dados no
 * Brasil. Nomes de recursos usam hifens, nunca travessoes.
 */

/** Regiao primaria (Sao Paulo). Dados primarios de pacientes residem no Brasil. */
export const PRIMARY_REGION = "sa-east-1";

/**
 * Regiao exigida por recursos globais do CloudFront (WAF escopo CLOUDFRONT e
 * certificados ACM usados pelo CloudFront). Documentada; usada apenas quando o
 * deploy real desses recursos ocorrer.
 */
export const CLOUDFRONT_GLOBAL_REGION = "us-east-1";

/** Prefixo de nomeacao dos recursos. */
export const RESOURCE_PREFIX = "dentalprime";

/**
 * Servico de backend e sua porta HTTP. As portas espelham o config.ts de cada
 * servico (fonte da verdade).
 */
export interface BackendService {
  /** Identificador do servico (kebab-case), usado em nomes de recursos. */
  readonly name: string;
  /** Porta HTTP que o container expoe. */
  readonly port: number;
  /** Prefixo publico same-origin recebido pelo ALB via CloudFront. */
  readonly apiPathPrefix: string;
  /** Schema PostgreSQL exclusivo do dominio. */
  readonly databaseSchema: string;
}

/**
 * Os sete servicos de backend por dominio. Portas alinhadas aos defaults dos
 * respectivos services/<nome>/src/config.ts.
 */
export const BACKEND_SERVICES: readonly BackendService[] = [
  {
    name: "identity-access",
    port: 3001,
    apiPathPrefix: "/api/identity",
    databaseSchema: "identity_access",
  },
  {
    name: "patient-record",
    port: 3002,
    apiPathPrefix: "/api/patients",
    databaseSchema: "patient_record",
  },
  {
    name: "smart-scheduling",
    port: 3003,
    apiPathPrefix: "/api/scheduling",
    databaseSchema: "smart_scheduling",
  },
  {
    name: "treatment-plan",
    port: 3004,
    apiPathPrefix: "/api/treatment",
    databaseSchema: "treatment_plan",
  },
  {
    name: "finance",
    port: 3005,
    apiPathPrefix: "/api/finance",
    databaseSchema: "finance",
  },
  {
    name: "crm-growth",
    port: 3006,
    apiPathPrefix: "/api/crm",
    databaseSchema: "crm_growth",
  },
  {
    name: "ai-front-desk",
    port: 3007,
    apiPathPrefix: "/api/ai",
    databaseSchema: "ai_front_desk",
  },
] as const;

/** Nome do banco de dados logico principal. */
export const DATABASE_NAME = "dentalprime";

/** Nome global e deterministico do bucket clinico de uma conta/ambiente. */
export function clinicalDocumentsBucketName(
  environment: string,
  account: string,
): string {
  if (!/^[a-z][a-z0-9-]+$/u.test(environment) || !/^\d{12}$/u.test(account)) {
    throw new Error("Ambiente ou conta invalida para o bucket clinico");
  }
  return `${RESOURCE_PREFIX}-clinical-${environment}-${account}`;
}
