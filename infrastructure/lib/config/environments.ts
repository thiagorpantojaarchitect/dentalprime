/**
 * Configuracao por ambiente. Ambientes menores (development) usam recursos
 * reduzidos; producao usa alta disponibilidade, protecao de remocao e retencao
 * de log maior.
 *
 * A conta AWS e opcional: quando ausente, o CDK resolve do contexto/CLI no
 * momento do deploy. A regiao e sempre sa-east-1 (excecao us-east-1 tratada nos
 * recursos globais do CloudFront).
 */

import { RemovalPolicy } from "aws-cdk-lib";
import { RetentionDays } from "aws-cdk-lib/aws-logs";

import { PRIMARY_REGION } from "../constants.js";

export type EnvironmentName = "development" | "staging" | "production";

export interface EnvironmentConfig {
  readonly name: EnvironmentName;
  /** Conta AWS alvo. Opcional; resolvida do contexto/CLI se ausente. */
  readonly account?: string;
  readonly region: string;
  readonly isProduction: boolean;
  /** Numero de NAT gateways (custo x resiliencia). */
  readonly natGateways: number;
  /** Numero maximo de AZs da VPC. */
  readonly maxAzs: number;
  /** Aurora com leitor(es) em outra AZ. */
  readonly auroraMultiAz: boolean;
  /** Numero desejado de tarefas por servico ECS. */
  readonly desiredCount: number;
  /** Autoscaling: capacidade minima. */
  readonly minCapacity: number;
  /** Autoscaling: capacidade maxima. */
  readonly maxCapacity: number;
  /** Protecao contra remocao acidental de recursos stateful. */
  readonly removalProtection: boolean;
  /** Politica de remocao aplicada a recursos stateful. */
  readonly removalPolicy: RemovalPolicy;
  /** Retencao dos grupos de log. */
  readonly logRetention: RetentionDays;
}

const development: EnvironmentConfig = {
  name: "development",
  region: PRIMARY_REGION,
  isProduction: false,
  natGateways: 1,
  maxAzs: 2,
  auroraMultiAz: false,
  desiredCount: 1,
  minCapacity: 1,
  maxCapacity: 2,
  removalProtection: false,
  removalPolicy: RemovalPolicy.DESTROY,
  logRetention: RetentionDays.TWO_WEEKS,
};

const staging: EnvironmentConfig = {
  name: "staging",
  region: PRIMARY_REGION,
  isProduction: false,
  natGateways: 1,
  maxAzs: 2,
  auroraMultiAz: false,
  desiredCount: 1,
  minCapacity: 1,
  maxCapacity: 3,
  removalProtection: false,
  removalPolicy: RemovalPolicy.DESTROY,
  logRetention: RetentionDays.ONE_MONTH,
};

const production: EnvironmentConfig = {
  name: "production",
  region: PRIMARY_REGION,
  isProduction: true,
  natGateways: 2,
  maxAzs: 3,
  auroraMultiAz: true,
  desiredCount: 2,
  minCapacity: 2,
  maxCapacity: 6,
  removalProtection: true,
  removalPolicy: RemovalPolicy.RETAIN,
  logRetention: RetentionDays.SIX_MONTHS,
};

const ENVIRONMENTS: Record<EnvironmentName, EnvironmentConfig> = {
  development,
  staging,
  production,
};

/** Retorna a configuracao de um ambiente pelo nome. */
export function getEnvironmentConfig(name: EnvironmentName): EnvironmentConfig {
  return ENVIRONMENTS[name];
}

/** Todos os ambientes conhecidos. */
export function allEnvironments(): readonly EnvironmentConfig[] {
  return [development, staging, production];
}
