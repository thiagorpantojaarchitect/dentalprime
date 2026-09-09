# Tasks — infrastructure (IaC)

- [x] 1. Estruturar o projeto CDK
  - `package.json` (@dentalprime/infrastructure), `tsconfig.json` (strict),
    `cdk.json` (`npx tsx bin/app.ts`), integrar ao monorepo (workspace).
  - `lib/constants.ts` (serviços + portas) e `lib/config/environments.ts`.
  - _Requisitos: 9.1, 9.2, 10.1_

- [x] 2. NetworkStack
  - VPC multi-AZ, subnets pública/privada/isolada, NAT por ambiente, VPC
    endpoints (S3, Secrets Manager, ECR, CloudWatch Logs), flow logs.
  - _Requisitos: 1.1, 1.2, 1.3, 1.4, 1.5_

- [x] 3. SecurityStack
  - KMS keys (dados, logs, backups) com rotação; Secrets Manager (dbCredentials,
    jwtSecret compartilhado, aiProviderKeys placeholder).
  - _Requisitos: 2.1, 2.2, 2.3, 2.4, 2.5_

- [x] 4. DataStack
  - Aurora PostgreSQL (Multi-AZ em prod, IAM auth), ElastiCache Redis, S3
    clinical-documents (KMS, block public, versionado, enforceSSL); SGs.
  - _Requisitos: 3.1, 3.2, 3.3, 3.4, 3.5, 2.2_

- [x] 5. MessagingStack
  - EventBridge bus + filas SQS com DLQ e criptografia.
  - _Requisitos: 5.1, 5.2, 5.3_

- [x] 6. IdentityStack
  - Cognito User Pool (senha forte, MFA, atributo tenantId) + client.
  - _Requisitos: 6.1, 6.2, 6.3_

- [x] 7. ComputeStack
  - ECS Fargate cluster + 7 serviços (portas 3001-3007) atrás de ALB, env +
    segredos em runtime, logs, autoscaling em prod, task role mínima.
  - _Requisitos: 4.1, 4.2, 4.3, 4.4, 4.5, 4.6, 2.4_

- [x] 8. EdgeStack
  - S3 privado do clinic-web + CloudFront (OAC) + behavior para ALB; WAF
    (managed rules + rate limit) parametrizado; ACM/Route53 placeholders.
  - _Requisitos: 7.1, 7.2, 7.3, 7.4_

- [x] 9. ObservabilityStack
  - Log groups com retenção/KMS, CloudTrail, pontos de integração
    OpenTelemetry documentados.
  - _Requisitos: 8.1, 8.2, 8.3, 8.4_

- [x] 10. Composição por ambiente + cdk-nag
  - `bin/app.ts` monta dev/staging/prod, dependências por props/ARN sem ciclo,
    proteção de remoção em prod, `AwsSolutionsChecks` (cdk-nag v3) com
    reconhecimentos documentados.
  - _Requisitos: 9.1, 9.3, 9.4, 9.5_

- [x] 11. Testes de infraestrutura
  - `aws-cdk-lib/assertions` para recursos-chave e config de ambientes (11 testes).
  - _Requisitos: 10.3_

- [x] 12. Verificação e publicação
  - `tsc --noEmit`, `cdk synth` (8 stacks OK), lint, format; sem deploy/bootstrap.
    Commit + push.
  - _Requisitos: 9.3, 10.1, 10.2_
