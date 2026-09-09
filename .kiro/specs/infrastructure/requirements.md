# Requisitos — infrastructure (IaC)

## Introdução

O módulo `infrastructure/` define, como código (AWS CDK em TypeScript), toda a
infraestrutura que hospeda o DentalPrime na AWS. Ele traduz as decisões de
`documentation/architecture-aws.md` e `.kiro/steering/architecture.md` em stacks
versionadas, parametrizadas por ambiente, prontas para síntese (`cdk synth`) e
implantação controlada.

Nesta fase escrevemos e sintetizamos a infraestrutura. **Nenhum recurso é
provisionado sem aprovação explícita.** Autenticar no Kiro não concede permissão
de deploy.

Região primária: `sa-east-1` (São Paulo). Nomes de recursos usam hífens, nunca
travessões. Segurança e LGPD por padrão.

## Requisitos

### Requisito 1 — Rede isolada e multi-AZ

**História:** Como operador da plataforma, quero uma rede segura e resiliente,
para que dados sensíveis fiquem isolados e o sistema tolere falha de uma zona.

#### Critérios de aceitação

1. QUANDO uma VPC de ambiente é sintetizada, ENTÃO o sistema DEVE criar subnets
   em ao menos duas zonas de disponibilidade.
2. O sistema DEVE separar subnets públicas (borda), privadas com egress (compute)
   e isoladas (dados).
3. QUANDO recursos de dados (Aurora, Redis) são criados, ENTÃO eles DEVEM residir
   em subnets sem rota de entrada pela internet.
4. O sistema DEVE prover VPC endpoints para S3, Secrets Manager, ECR e CloudWatch
   Logs, evitando tráfego desses serviços pela internet pública.
5. ONDE o ambiente é produção, o sistema DEVE usar NAT em múltiplas AZs.

### Requisito 2 — Criptografia e segredos

**História:** Como responsável por conformidade, quero criptografia forte e
segredos gerenciados, para atender à LGPD e evitar vazamento de credenciais.

#### Critérios de aceitação

1. O sistema DEVE criar chaves KMS com rotação habilitada para dados, logs e
   backups.
2. TODA persistência (banco, cache, S3, backups) DEVE usar criptografia em
   repouso com KMS.
3. O sistema DEVE armazenar segredos (credenciais de banco, segredo JWT
   compartilhado, chaves de fornecedores de IA) no Secrets Manager.
4. O sistema NÃO DEVE colocar segredos em código, variáveis planas, logs ou
   imagens de container; segredos são resolvidos em runtime.
5. QUANDO os serviços de backend validam JWT, ENTÃO todos DEVEM referenciar o
   mesmo segredo JWT compartilhado.

### Requisito 3 — Dados gerenciados

**História:** Como equipe de produto, quero banco e cache gerenciados, para focar
no produto sem operar servidores de dados.

#### Critérios de aceitação

1. O sistema DEVE provisionar Aurora PostgreSQL como banco relacional principal.
2. ONDE o ambiente é produção, o Aurora DEVE ser Multi-AZ (writer + reader).
3. O sistema DEVE provisionar ElastiCache Redis para cache/sessão em subnets
   privadas.
4. O sistema DEVE criar buckets S3 para documentos clínicos com criptografia KMS,
   bloqueio de acesso público e versionamento.
5. O isolamento multi-tenant por `tenant_id` permanece responsabilidade da
   aplicação; a infraestrutura NÃO substitui esse controle.

### Requisito 4 — Computação em containers

**História:** Como engenheiro, quero rodar os serviços em containers gerenciados,
para escalar sem operar servidores nem Kubernetes.

#### Critérios de aceitação

1. O sistema DEVE criar um cluster ECS Fargate.
2. O sistema DEVE definir um serviço Fargate para cada domínio de backend
   (identity-access, patient-record, smart-scheduling, treatment-plan, finance,
   crm-growth, ai-front-desk).
3. QUANDO um serviço é criado, ENTÃO ele DEVE receber configuração por variáveis
   de ambiente e segredos injetados do Secrets Manager em runtime.
4. O sistema DEVE colocar os serviços atrás de um Application Load Balancer.
5. ONDE o ambiente é produção, cada serviço DEVE ter autoscaling por métrica de
   uso e ao menos duas tarefas.
6. A task role de cada serviço DEVE conceder acesso de privilégio mínimo apenas
   aos recursos que o serviço usa (Secrets, KMS, SQS, EventBridge, S3).

### Requisito 5 — Mensageria e eventos

**História:** Como arquiteto, quero comunicação assíncrona entre domínios, para
reduzir acoplamento síncrono.

#### Critérios de aceitação

1. O sistema DEVE criar um barramento EventBridge para eventos de domínio.
2. O sistema DEVE criar filas SQS com dead-letter queue para processamento
   assíncrono.
3. QUANDO uma fila é criada, ENTÃO ela DEVE usar criptografia em repouso.

### Requisito 6 — Identidade

**História:** Como usuário (equipe, admin, paciente), quero autenticação segura,
para acessar apenas o que me é permitido.

#### Critérios de aceitação

1. O sistema DEVE criar um Cognito User Pool integrável ao módulo
   identity-access.
2. O User Pool DEVE aplicar política de senha forte e suportar MFA.
3. A autorização de aplicação (papéis clínicos, permissões por tenant) permanece
   no módulo identity-access; a infraestrutura provê apenas a identidade base.

### Requisito 7 — Borda e entrega

**História:** Como operador, quero proteção de borda e entrega via CDN, para
segurança e performance.

#### Critérios de aceitação

1. O sistema DEVE colocar CloudFront à frente do frontend e da API.
2. O sistema DEVE associar um WAF com regras gerenciadas e limitação de taxa.
3. O sistema DEVE servir o frontend (clinic-web) a partir de um bucket S3 privado
   acessado por CloudFront (OAC), sem acesso público direto ao bucket.
4. ONDE houver domínio configurado, o sistema DEVE usar certificado TLS
   gerenciado (ACM).

### Requisito 8 — Observabilidade e auditoria

**História:** Como operador, quero logs, métricas e trilha de auditoria, para
diagnosticar e comprovar conformidade.

#### Critérios de aceitação

1. O sistema DEVE criar grupos de log do CloudWatch para os serviços, com
   retenção definida e criptografia.
2. O sistema DEVE habilitar CloudTrail para auditoria de API da AWS.
3. Logs NÃO DEVEM conter dados sensíveis ou segredos em texto claro (garantido
   pela aplicação; a infra provê o destino e a criptografia).
4. O sistema DEVE prover pontos de integração para tracing (OpenTelemetry).

### Requisito 9 — Ambientes e implantação controlada

**História:** Como responsável, quero ambientes separados e deploy aprovado, para
proteger produção e a residência de dados.

#### Critérios de aceitação

1. O sistema DEVE parametrizar os stacks por ambiente (development, staging,
   production).
2. TODOS os recursos DEVEM ser criados na região `sa-east-1`, salvo recursos que
   exigem `us-east-1` (ex.: WAF/ACM de CloudFront), quando aplicável.
3. O código de infraestrutura NÃO DEVE executar deploy nem bootstrap
   automaticamente; a síntese (`cdk synth`) é a única operação padrão.
4. QUANDO um stack contém recurso stateful (banco, bucket de dados), ENTÃO ele
   DEVE ter proteção contra remoção acidental em produção.
5. O sistema DEVE aplicar verificações de conformidade (cdk-nag) na síntese.

### Requisito 10 — Qualidade do código de infraestrutura

**História:** Como time, quero o IaC com o mesmo padrão de qualidade do resto do
monorepo.

#### Critérios de aceitação

1. O código DEVE ser TypeScript com `strict`, passar em lint e formatação.
2. O projeto DEVE sintetizar sem erros (`cdk synth`).
3. ONDE houver lógica testável (configuração de ambiente, asserções de stack), o
   sistema DEVE ter testes automatizados.
