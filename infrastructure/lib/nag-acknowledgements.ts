/**
 * Reconhecimentos (acknowledgements) de regras do cdk-nag.
 *
 * Cada item aqui e uma decisao consciente desta fase de fundacao, com
 * justificativa. Reconhecer NAO e ignorar: documenta por que a regra nao se
 * aplica ao desenho atual ou depende de uma configuracao externa (ex. dominio
 * e certificado ACM). Regras de seguranca que
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
      "Os buckets de dados, frontends e CloudTrail enviam access logs a sinks dedicados. O reconhecimento se aplica apenas aos proprios sinks, que nao podem registrar em si mesmos sem criar recursao infinita.",
  },
  {
    id: "AwsSolutions-ECS2",
    reason:
      "Variaveis da task contem somente configuracao nao sensivel (hosts, nomes, portas e flags). Credenciais, JWT e Redis AUTH sao injetados do Secrets Manager em runtime.",
  },
  {
    id: "AwsSolutions-CFR4",
    reason:
      "Sem certificado ACM proprio nesta fase, o CloudFront usa o certificado padrao (politica TLSv1). Ao configurar dominio e ACM, a politica minima sera TLSv1.2_2021.",
  },
  {
    id: "AwsSolutions-CFR5",
    reason:
      "No development, CloudFront usa HTTP ate o ALB e autentica a origem com header secreto. O viewer usa HTTPS; TLS na origem depende do dominio e certificado ACM do ambiente compartilhado.",
  },
  {
    id: "AwsSolutions-CFR1",
    reason:
      "Restricao geografica nao se aplica: o produto atende o mercado brasileiro e nao restringe por pais nesta fase.",
  },
  {
    id: "AwsSolutions-AEC5",
    reason:
      "Ofuscacao de porta do Redis sera avaliada em endurecimento posterior; o Redis fica em subnet isolada, sem acesso publico, com SG restrito.",
  },
  {
    // Finding granular: Resource::* na policy da execution role. A acao
    // ecr:GetAuthorizationToken NAO suporta escopo por recurso (exigencia da
    // API da AWS), por isso resolve para Resource::*. As demais permissoes
    // (pull da imagem, escrita de logs) sao escopadas ao repositorio/log group
    // pelos constructos do CDK.
    id: "AwsSolutions-IAM5[Resource::*]",
    reason:
      "Acoes que nao suportam escopo por recurso (design da API da AWS): ecr:GetAuthorizationToken, xray:Put*/Get* e cloudwatch:PutMetricData (usadas pelo coletor ADOT). Pull de imagem e escrita de logs ja sao escopados pelo CDK ao repositorio ECR e ao log group.",
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
