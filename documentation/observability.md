# Observabilidade — DentalPrime

Tracing distribuido e metricas via OpenTelemetry, seguindo a arquitetura
(`documentation/architecture-aws.md`: CloudWatch + OpenTelemetry).

## Instrumentacao dos servicos

O pacote `@dentalprime/observability` expoe `startTelemetry({ serviceName, ... })`,
chamado no inicio de cada `main.ts` **antes** de carregar o app (import dinamico),
para que HTTP, `pg` e Fastify sejam instrumentados automaticamente.

- **No-op sem endpoint:** se `OTEL_EXPORTER_OTLP_ENDPOINT` nao estiver definido,
  a telemetria nao inicia. Isso mantem desenvolvimento e testes simples e sem
  dependencia de rede.
- **Nunca derruba o servico:** falhas ao iniciar/encerrar a telemetria sao
  ignoradas.
- **LGPD:** nao adicionamos atributos com PII nos spans; a instrumentacao de
  banco nao captura valores de parametros. Consultas parametrizadas mantem dados
  fora do texto do span.

## Coletor no ECS (ADOT)

No `ComputeStack`, cada task de servico roda um sidecar **ADOT** (AWS Distro for
OpenTelemetry, imagem `aws-otel-collector`). O app exporta OTLP para
`http://localhost:4318` (o sidecar), que encaminha:

- **Traces → AWS X-Ray**
- **Metricas → CloudWatch**

A task role recebe apenas as acoes necessarias (`xray:Put*`/`Get*`,
`cloudwatch:PutMetricData`), que por design da API usam `Resource: *`
(reconhecido no cdk-nag como `AwsSolutions-IAM5[Resource::*]`).

## Variaveis de ambiente relevantes

| Variavel | Efeito |
|---|---|
| `OTEL_EXPORTER_OTLP_ENDPOINT` | Ativa a telemetria e define o destino OTLP. No ECS: `http://localhost:4318`. |
| `OTEL_SERVICE_NAME` | Nome do servico nos spans (definido pelo ComputeStack). |

## Logs e auditoria

Logs de aplicacao vao para o CloudWatch (grupo por servico, criptografado com
KMS). A auditoria de API da AWS e feita pelo CloudTrail (ver
`ObservabilityStack`). Logs nunca contem segredos ou PII em texto claro.
