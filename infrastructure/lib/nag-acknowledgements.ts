/**
 * Reconhecimentos (acknowledgements) de regras do cdk-nag.
 *
 * Cada item aqui e uma decisao consciente desta fase de fundacao, com
 * justificativa. Reconhecer NAO e ignorar: documenta por que a regra nao se
 * aplica agora ou sera atendida em iteracao futura (ex.: logs de acesso e
 * certificado ACM proprio quando houver dominio). Regras de seguranca que
 * podemos atender ja foram corrigidas no codigo (flow logs, IAM auth no RDS,
 * criptografia, block public access, etc.).
 *
 * API do cdk-nag v3: reconhecimento por `Validations.of(scope).acknowledge(...)`.
 */

import { Validations } from "aws-cdk-lib";
import type { Stack } from "aws-cdk-lib";

import type { EnvironmentConfig } from "./config/environments.js";

interface Ack {
  readonly id: string;
  readonly reason: string;
}

/** Reconhecimentos comuns a todos os ambientes (decisoes desta fase). */
const COMMON_ACKS: readonly Ack[] = [
  {
    id: "AwsSolutions-EC23",
    reason:
      "Regra do cdk-nag falha ao avaliar o SG do interface endpoint (CIDR do VPC vem como token nao-primitivo). O ingress e restrito ao CIDR do proprio VPC pelo constructo de endpoint.",
  },
  {
    id: "AwsSolutions-SMG4",
    reason:
      "Rotacao automatica de segredos sera configurada com a integracao de banco (Lambda de rotacao) em iteracao posterior. Nesta fase de fundacao os segredos sao gerados e resolvidos em runtime.",
  },
  {
    id: "AwsSolutions-S1",
    reason:
      "Logs de acesso de servidor S3 serao habilitados com um bucket de logs central dedicado em iteracao posterior. Auditoria de API ja e coberta pelo CloudTrail.",
  },
  {
    id: "AwsSolutions-ELB2",
    reason:
      "Logs de acesso do ALB serao habilitados com bucket de logs dedicado em iteracao posterior; o CloudFront e a borda primaria.",
  },
  {
    id: "AwsSolutions-ECS2",
    reason:
      "As variaveis de ambiente da task sao apenas nao-sensiveis (NODE_ENV, PORT, DATABASE_HOST/PORT/NAME). Segredos (usuario, senha, JWT) sao injetados do Secrets Manager via 'secrets', nunca em texto plano.",
  },
  {
    id: "AwsSolutions-CFR3",
    reason:
      "Logs de acesso do CloudFront serao habilitados com bucket de logs dedicado em iteracao posterior.",
  },
  {
    id: "AwsSolutions-CFR4",
    reason:
      "Sem certificado ACM proprio nesta fase, o CloudFront usa o certificado padrao (politica TLSv1). Ao configurar dominio e ACM, a politica minima sera TLSv1.2_2021.",
  },
  {
    id: "AwsSolutions-CFR5",
    reason:
      "A origem /api/* usa HTTP para o ALB interno em VPC nesta fase; TLS de ponta a ponta ate a origem sera habilitado com certificado no ALB em iteracao posterior.",
  },
  {
    id: "AwsSolutions-CFR1",
    reason:
      "Restricao geografica nao se aplica: o produto atende o mercado brasileiro e nao restringe por pais nesta fase.",
  },
  {
    id: "AwsSolutions-COG8",
    reason:
      "O tier Plus do Cognito (recursos avancados de seguranca) sera avaliado quando houver volume; a fundacao usa senha forte e MFA (obrigatorio em producao).",
  },
  {
    id: "AwsSolutions-AEC5",
    reason:
      "Ofuscacao de porta do Redis sera avaliada em endurecimento posterior; o Redis fica em subnet isolada, sem acesso publico, com SG restrito.",
  },
  {
    id: "AwsSolutions-AEC6",
    reason:
      "Redis AUTH sera habilitado com token no Secrets Manager em iteracao posterior; criptografia em repouso e em transito ja estao habilitadas e o acesso e restrito por SG em subnet isolada.",
  },
];

/** Reconhecimentos aplicaveis apenas fora de producao (recursos reduzidos). */
const NON_PROD_ACKS: readonly Ack[] = [
  {
    id: "AwsSolutions-RDS10",
    reason:
      "Protecao de remocao do RDS fica desativada fora de producao para permitir limpeza de ambientes efemeros. Em producao e habilitada.",
  },
  {
    id: "AwsSolutions-AEC4",
    reason:
      "Redis single-AZ fora de producao por custo. Em producao usa Multi-AZ com failover automatico.",
  },
  {
    id: "AwsSolutions-COG2",
    reason:
      "MFA e opcional fora de producao para facilitar testes. Em producao e obrigatorio.",
  },
];

/**
 * Aplica os reconhecimentos de cdk-nag a um stack, conforme o ambiente.
 */
export function acknowledgeNagRules(stack: Stack, envConfig: EnvironmentConfig): void {
  const acks = envConfig.isProduction ? COMMON_ACKS : [...COMMON_ACKS, ...NON_PROD_ACKS];
  for (const ack of acks) {
    Validations.of(stack).acknowledge(ack);
  }
}
