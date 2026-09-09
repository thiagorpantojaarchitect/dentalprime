# Design — infrastructure (IaC)

## Visão geral

Infraestrutura como código com **AWS CDK v2 (TypeScript)**. A aplicação CDK
compõe, por ambiente, um conjunto de stacks coesos por responsabilidade. A
síntese (`cdk synth`) é a operação padrão; deploy e bootstrap só ocorrem com
aprovação explícita e credenciais/perfis dedicados por ambiente.

Região primária: `sa-east-1`. Nomes de recursos usam hífens. Segurança e LGPD
por padrão (KMS, Secrets Manager, subnets isoladas, WAF, CloudTrail).

## Estrutura do projeto

```
infrastructure/
├── package.json          # @dentalprime/infrastructure (privado)
├── tsconfig.json         # TS strict, próprio (não entra nas project refs Node)
├── cdk.json              # app: npx tsx bin/app.ts
├── bin/
│   └── app.ts            # entrypoint: monta ambientes + stacks + cdk-nag
├── lib/
│   ├── config/
│   │   └── environments.ts   # definição de ambientes (dev/staging/prod)
│   ├── constants.ts          # serviços de backend, portas, nomes
│   ├── network-stack.ts
│   ├── security-stack.ts
│   ├── data-stack.ts
│   ├── messaging-stack.ts
│   ├── identity-stack.ts
│   ├── compute-stack.ts
│   ├── edge-stack.ts
│   └── observability-stack.ts
└── test/
    └── *.test.ts             # asserções com aws-cdk-lib/assertions
```

O `infrastructure/` é um workspace npm, mas fica **fora** das project references
de build Node do monorepo raiz (é compilado/sintetizado pelo próprio CDK via
`tsx`), assim como `apps/clinic-web`.

## Configuração de ambientes

`lib/config/environments.ts` define um tipo `EnvironmentConfig` com:

- `name`: "development" | "staging" | "production"
- `account?`: conta AWS (opcional; resolvido do contexto/CLI se ausente)
- `region`: sempre `sa-east-1`
- `isProduction`: boolean derivado
- flags de dimensionamento: `natGateways`, `auroraMultiAz`, `desiredCount`,
  `minCapacity`, `maxCapacity`, `removalProtection`, `logRetentionDays`.

Ambientes menores (dev) usam 1 NAT, Aurora single-AZ, 1 tarefa e remoção
permitida; produção usa 2+ AZ, Multi-AZ, 2+ tarefas, proteção de remoção e
retenção de log maior.

## Constantes

`lib/constants.ts` lista os serviços de backend e suas portas (alinhadas ao
`config.ts` de cada serviço):

| Serviço            | Porta |
|--------------------|-------|
| identity-access    | 3001  |
| patient-record     | 3002  |
| smart-scheduling   | 3003  |
| treatment-plan     | 3004  |
| finance            | 3005  |
| crm-growth         | 3006  |
| ai-front-desk      | 3007  |

## Stacks

### NetworkStack

- `ec2.Vpc` com `maxAzs` (2 em dev, 3 em prod), 3 grupos de subnet:
  `PUBLIC`, `PRIVATE_WITH_EGRESS`, `PRIVATE_ISOLATED`.
- `natGateways` conforme ambiente.
- VPC endpoints: gateway para S3; interface para Secrets Manager, ECR
  (api + dkr), CloudWatch Logs.
- Expõe a `vpc` para os demais stacks.

### SecurityStack

- KMS keys com `enableKeyRotation: true`: `dataKey` (banco/cache/S3),
  `logsKey` (logs), `backupKey` (backups).
- Secrets Manager:
  - `dbCredentials` (gerado; usado pelo Aurora).
  - `jwtSecret` (gerado, ≥ 32 bytes; compartilhado entre serviços para HS256).
  - `aiProviderKeys` (placeholder vazio; preenchido fora do código).
- Expõe keys e secrets.

### DataStack

- `rds.DatabaseCluster` Aurora PostgreSQL, engine versão fixada, credenciais do
  secret, criptografia com `dataKey`, em subnets isoladas, `writer` + `readers`
  (readers só em prod), `storageEncrypted`, janela de backup, `deletionProtection`
  em prod.
- `elasticache.CfnReplicationGroup` (Redis) em subnets privadas, `atRestEncryption`
  e `transitEncryption` habilitados, subnet group + security group próprios.
- `s3.Bucket` `clinical-documents`: `blockPublicAccess: BLOCK_ALL`,
  `encryption: KMS` (`dataKey`), `versioned: true`, `enforceSSL: true`,
  removal protection em prod.
- Security groups: DB e Redis aceitam tráfego apenas do SG de compute.

### MessagingStack

- `events.EventBridge` (bus `dentalprime-events-<env>`).
- Filas SQS por necessidade assíncrona (ex.: `notifications`, `events-dlq`),
  cada uma com DLQ e `encryption` (KMS gerenciado ou `dataKey`).

### IdentityStack

- `cognito.UserPool` `dentalprime-users-<env>`: política de senha forte, MFA
  opcional/obrigatório conforme ambiente, `signInAliases` por e-mail, atributos
  customizados para `tenantId`. `UserPoolClient` para a aplicação.
- Autorização de aplicação permanece no identity-access.

### ComputeStack

- `ecs.Cluster` no VPC, container insights habilitado.
- Para cada serviço da tabela: `FargateTaskDefinition` + container (imagem do
  ECR, placeholder), `PORT`/`NODE_ENV` via env, `DATABASE_URL`/`JWT_SECRET` via
  `secrets` (Secrets Manager em runtime), log driver para CloudWatch com
  `logsKey`.
- Um `ApplicationLoadBalancer` compartilhado; listener com regras de path por
  serviço (ex.: `/identity/*` → identity-access) ou um ALB por serviço em prod
  (decisão: listener único com regras para simplicidade inicial).
- Autoscaling (`scaleOnCpuUtilization`) em prod.
- Security group de compute usado como origem permitida nos SGs de DB/Redis.
- Task role com `grantRead` nos secrets, `grant` nas filas/bus/bucket que o
  serviço usa (privilégio mínimo).

### EdgeStack

- `s3.Bucket` `clinic-web-<env>` privado + `cloudfront.Distribution` com Origin
  Access Control (OAC) para o bucket estático e um behavior de origem para o ALB
  (`/api/*`).
- `wafv2.CfnWebACL` com AWS Managed Rules (Common, KnownBadInputs) e uma regra
  de rate limiting, associado ao CloudFront. WAF de CloudFront exige escopo
  `CLOUDFRONT` (região `us-east-1`); tratado com stack/US-east-1 quando deploy
  real ocorrer. Nesta fase, documentado e parametrizado.
- ACM/Route53 como placeholders (habilitados quando houver domínio).

### ObservabilityStack

- `logs.LogGroup` central e por serviço, com `retention` e `encryptionKey`.
- `cloudtrail.Trail` com bucket dedicado (KMS) para auditoria de API AWS.
- Dashboards/alarmes básicos (CPU/erros do ALB) — extensível.
- Pontos de integração para OpenTelemetry (sidecar/collector) documentados;
  implementação de coletor fica para iteração futura.

## Composição (bin/app.ts)

Para cada ambiente habilitado:

1. Instancia `NetworkStack`, `SecurityStack`.
2. `DataStack`, `MessagingStack`, `IdentityStack` dependem de network/security.
3. `ComputeStack` depende de network, security, data, messaging.
4. `EdgeStack` depende de compute (ALB) e do bucket estático.
5. `ObservabilityStack` transversal.
6. `Aspects.of(app).add(new AwsSolutionsChecks())` (cdk-nag) para conformidade;
   supressões documentadas apenas quando justificadas.

Dependências entre stacks são explícitas (`addDependency`) ou por passagem de
referências tipadas via props (preferido, evita exports frágeis).

## Segurança e conformidade

- Sem segredos no código: apenas ARNs/nomes; valores no Secrets Manager.
- KMS com rotação; criptografia em repouso e TLS em trânsito.
- Subnets isoladas para dados; SGs de privilégio mínimo.
- `blockPublicAccess` e `enforceSSL` nos buckets; OAC no CloudFront.
- cdk-nag na síntese; proteção de remoção em recursos stateful de produção.
- Deploy nunca automático; região restrita a `sa-east-1` (exceção documentada
  para WAF/ACM de CloudFront em `us-east-1`).

## Testes

- `aws-cdk-lib/assertions` (`Template.fromStack`) para asserções: presença de
  recursos-chave (VPC, cluster, cluster Aurora, user pool), `blockPublicAccess`
  dos buckets, rotação de KMS, filas com DLQ, número de serviços = 7.
- Teste da configuração de ambientes (dev vs prod: NAT, Multi-AZ, contagem).

## Decisões

- **CDK v2 + tsx** (sem passo de compilação separado); alinhado ao guia CDK.
- **Referências por props tipadas** em vez de `Fn.importValue` para evitar
  "deadly embrace" e acoplamento por export.
- **Listener ALB único com regras de path** no início (simplicidade), revisável
  para ALB/serviço quando a escala justificar.
- **WAF/ACM de CloudFront**: escopo global exige `us-east-1`; parametrizado e
  documentado, sem provisionar nesta fase.
- **Sem EKS** (decisão firme de arquitetura).
