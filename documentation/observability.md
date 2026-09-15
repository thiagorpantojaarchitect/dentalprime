# Observabilidade e operação

O ambiente de desenvolvimento entrega logs, métricas, traces, auditoria e
alarmes desde o primeiro provisionamento. O stack
dentalprime-development-observability centraliza o dashboard e o CloudTrail.

## Sinais disponíveis

- Logs JSON de cada aplicação e do collector ADOT em
  /dentalprime/development/<serviço>.
- Container Insights no cluster ECS.
- Traces enviados para AWS X-Ray pelo ADOT fixado por digest imutável.
- Métricas do ALB, ECS, Aurora, SQS e EventBridge no CloudWatch.
- Logs de acesso do ALB, CloudFront e buckets S3 em buckets privados.
- CloudTrail de management events e data events do bucket clínico.

Os grupos de log e o CloudTrail usam uma chave KMS cuja policy autoriza
explicitamente CloudWatch Logs e CloudTrail com restrições de conta, região e
encryption context.

## Dashboard

O dashboard dentalprime-development-operations contém estado dos alarmes,
respostas 5xx e targets não saudáveis do ALB, CPU do Aurora, profundidade/idade
da fila e falhas de entrega do EventBridge.

O workflow de deploy encerra com erro se algum alarme do prefixo
dentalprime-development- estiver em ALARM. Antes disso, ele espera os serviços
ECS estabilizarem e consulta /api/<domínio>/ready pela URL CloudFront.

## Alarmes

| Alarme | Interpretação inicial |
| --- | --- |
| alb-5xx | falha de aplicação, dependência ou rollout |
| unhealthy-hosts | /ready não responde ou banco indisponível |
| database-cpu | saturação do Aurora |
| notifications-dlq | mensagens esgotaram as tentativas |
| notifications-age | consumidor ausente ou fila represada |
| event-delivery | EventBridge não conseguiu entregar ao target |

Development não cria, por padrão, um tópico de paging. O dashboard e o gate de
deploy são os canais ativos. Antes de produção, conecte os alarmes a um tópico
SNS/chat/on-call aprovado, com responsáveis e níveis de severidade definidos.

## Investigação rápida

1. Identifique o primeiro alarme e o horário da transição.
2. Para unhealthy-hosts, veja eventos do serviço ECS e depois logs de /ready.
3. Para 5xx, filtre logs pelo request/correlation ID e confirme Aurora, Redis ou
   Bedrock.
4. Para notifications-age, veja a fila de reminders e a DLQ. Não faça redrive
   até corrigir a causa.
5. Para event-delivery, confira a rule ReminderScheduled.v1, a policy da fila e
   a chave KMS.
6. Compare a task definition em execução com a tag SHA registrada no deploy.

## Consultas úteis no CloudWatch Logs Insights

Erros por serviço:

~~~text
fields @timestamp, level, service, requestId, msg
| filter level = "error" or level = 50
| sort @timestamp desc
| limit 100
~~~

Latência de requests, quando o campo durationMs estiver presente:

~~~text
fields @timestamp, route, statusCode, durationMs
| stats pct(durationMs, 50), pct(durationMs, 95), pct(durationMs, 99) by route
| sort pct(durationMs, 95) desc
~~~

Não registre token JWT, senha, segredo Redis, documento clínico ou payload com
PII. O evento ReminderScheduled.v1 contém apenas identificadores mínimos e seu
contrato deve continuar sem PII.

## Saúde e readiness

- /health confirma que o processo HTTP está vivo.
- /ready consulta a dependência de banco sem expor detalhes da falha.
- O container ECS e o target group do ALB usam /ready.
- O CloudFront preserva /api/*; o ALB reescreve
  /api/<domínio>/ready para /ready depois de selecionar o target.

Uma falha de banco, portanto, retira a task do balanceamento e impede o deploy de
ser declarado saudável. Consulte a capacidade do banco antes de reiniciar tasks
em massa.

## Auditoria e retenção

CloudTrail registra chamadas de controle e operações de objeto no bucket
clínico. Logs de acesso de ALB, CloudFront e S3 ajudam a correlacionar origem e
horário sem depender apenas dos logs da aplicação.

Development segue retenções curtas definidas na configuração do ambiente para
controlar custo. Produção deve preservar a retenção LGPD aprovada, proteção
contra remoção e acesso de leitura restrito às funções de operação/auditoria.

## Teste operacional após implantação

1. Abra clinic e admin pelas URLs do resumo do workflow.
2. Consulte /api/identity/ready e os outros seis domínios.
3. Faça uma requisição autenticada e localize o log e o trace.
4. Publique um lembrete de teste sem PII e confirme sua chegada na fila.
5. Valide que acesso direto ao DNS do ALB não alcança rotas /api úteis.
6. Confirme um recovery point diário do Aurora e agende um exercício de restore.
