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
  /** Prefixo de rota no ALB (roteamento por path). */
  readonly pathPrefix: string;
}

/**
 * Os sete servicos de backend por dominio. Portas alinhadas aos defaults dos
 * respectivos services/<nome>/src/config.ts.
 */
export const BACKEND_SERVICES: readonly BackendService[] = [
  { name: "identity-access", port: 3001, pathPrefix: "/identity" },
  { name: "patient-record", port: 3002, pathPrefix: "/patients" },
  { name: "smart-scheduling", port: 3003, pathPrefix: "/scheduling" },
  { name: "treatment-plan", port: 3004, pathPrefix: "/treatment" },
  { name: "finance", port: 3005, pathPrefix: "/finance" },
  { name: "crm-growth", port: 3006, pathPrefix: "/crm" },
  { name: "ai-front-desk", port: 3007, pathPrefix: "/ai" },
] as const;

/** Nome do banco de dados logico principal. */
export const DATABASE_NAME = "dentalprime";
