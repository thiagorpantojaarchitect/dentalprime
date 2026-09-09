# infrastructure/

Infraestrutura como código (AWS CDK, TypeScript). **Nada é provisionado sem
aprovação explícita.** A operação padrão é a síntese (`cdk synth`); deploy e
bootstrap usam funções IAM dedicadas por ambiente, com aprovação. Autenticar no
Kiro não concede permissão de deploy.

Ver spec em `.kiro/specs/infrastructure/`, `documentation/architecture-aws.md` e
`.kiro/steering/architecture.md`.

## Stacks

Compostas por ambiente em `bin/app.ts` (dependências por props/ARN, sem ciclo):

- **network** — VPC multi-AZ (público/privado/isolado), NAT, VPC endpoints
  (S3, Secrets Manager, ECR, CloudWatch Logs), flow logs.
- **security** — KMS (dados, logs, backups) com rotação; Secrets Manager
  (credenciais de banco, segredo JWT compartilhado, chaves de IA placeholder).
- **data** — Aurora PostgreSQL (Multi-AZ em prod, IAM auth), ElastiCache Redis,
  bucket S3 de documentos clínicos (KMS, block public, versionado, TLS).
- **messaging** — EventBridge bus + filas SQS com DLQ (criptografadas).
- **identity** — Cognito User Pool (senha forte, MFA, atributo `tenantId`).
- **compute** — ECS Fargate: cluster + 7 serviços (portas 3001-3007) atrás de
  ALB (roteamento por path), segredos injetados em runtime, autoscaling em prod.
- **edge** — CloudFront (OAC para o bucket estático do clinic-web, behavior
  `/api/*` para o ALB) + WAF (regras gerenciadas + rate limit). Em `us-east-1`.
- **observability** — CloudTrail (bucket dedicado, KMS), grupo de log central.

## Comandos

Região primária `sa-east-1`. Nomes de recursos com hífens, nunca travessões.

```bash
# Sintetizar o ambiente de desenvolvimento (padrão)
npm run synth

# Sintetizar outro ambiente
npx cdk synth -c env=staging
npx cdk synth -c env=production

# Verificar tipos e rodar os testes
npm run typecheck
npm test
```

## Conformidade (cdk-nag)

`AwsSolutionsChecks` (cdk-nag v3) roda na síntese via framework de policy
validation do CDK. Regras de segurança que podemos atender já estão no código
(flow logs, IAM auth no RDS, criptografia KMS, block public access, enforceSSL,
DLQ, MFA em produção). Decisões conscientes desta fase (ex.: logs de acesso e
certificado ACM próprio quando houver domínio) estão reconhecidas com
justificativa em `lib/nag-acknowledgements.ts`.

## Notas

- `infrastructure/` é um workspace npm, mas fica fora das project references de
  build Node do monorepo (é sintetizado pelo CDK via `tsx`), como `apps/clinic-web`.
- Referências entre stacks são passadas por props tipadas ou por ARN (string),
  evitando exports frágeis e ciclos de dependência.
- Imagem de container das tasks é um placeholder (Node) até o pipeline de build
  e publicação de imagens no ECR ser definido.
