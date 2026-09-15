# Infraestrutura AWS do DentalPrime

AWS CDK em TypeScript para development, staging e production. A implantação
suportada nesta entrega é development e ocorre pelo workflow
deploy-development.

## Stacks

| Ordem | Stack | Responsabilidade |
| --- | --- | --- |
| 1 | Network | VPC, subnets, NAT, endpoints e flow logs |
| 2 | Security | KMS e segredos gerados |
| 3 | Registry | sete repositórios ECR imutáveis |
| 4 | Data | Aurora, Redis AUTH, S3 clínico e AWS Backup |
| 5 | Messaging | EventBridge, reminder queue e DLQ |
| 6 | Compute | ECS, task definitions, migrations e ALB/rewrite |
| 7 | Edge | WAF, dois sites S3 e duas distribuições CloudFront |
| 8 | Observability | CloudTrail, dashboard e alarmes |

Registry fica separado de Compute para permitir o primeiro build. Compute aceita
desiredCount=0, registra a revisão exata das migrations e só é ativado depois de
todas elas e do bootstrap idempotente do primeiro tenant concluírem. A
credencial inicial fica em Secrets Manager e não aparece no workflow.

## Comandos de validação

~~~bash
npm run typecheck --workspace @dentalprime/infrastructure
npm test --workspace @dentalprime/infrastructure
npx cdk synth --strict -c env=development -c account=111111111111 -c desiredCount=0
~~~

Não execute deploy com a conta sintética. Para implantação, use o workflow
GitHub Actions e a conta configurada no Environment development.

## Contextos

- env: development, staging ou production.
- account: conta AWS de 12 dígitos; obrigatório quando não há sessão AWS.
- imageTag: tag imutável comum às imagens, normalmente o SHA.
- desiredCount: zero para a fase pré-migração.
- aiProvider: stub por padrão ou bedrock.
- bedrockModelId: ID simples ou ARN completo.
- bedrockGuardrailId e bedrockGuardrailVersion: sempre em par.
- clinicalDocumentsCorsOrigins: lista separada por vírgulas. Development usa
  `*` por padrão; staging e production exigem origins HTTPS explícitas.

Veja [deployment.md](../documentation/deployment.md) para o runbook completo,
[github-setup.md](../documentation/github-setup.md) para OIDC e
[observability.md](../documentation/observability.md) para operação.
