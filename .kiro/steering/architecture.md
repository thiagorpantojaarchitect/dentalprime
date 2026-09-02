# Arquitetura — DentalPrime

Regras de arquitetura sempre aplicáveis. Kiro e Codex devem seguir estas
diretrizes ao projetar e implementar qualquer módulo.

## Visão geral

- **Monorepo** com aplicações (`apps/`), serviços de backend (`services/`),
  bibliotecas compartilhadas (`packages/`) e infraestrutura como código
  (`infrastructure/`).
- **Multi-tenant** desde o primeiro dia. Toda entidade de negócio é isolada por
  `tenant_id` (clínica ou rede). Nenhuma consulta cruza tenants sem autorização
  explícita e auditada.
- **Backend orientado a domínios.** Cada módulo (identity-access,
  patient-record, etc.) é um limite de domínio com sua própria persistência
  lógica, contratos e eventos.
- **Comunicação assíncrona por eventos** entre domínios (EventBridge/SQS).
  Evitar acoplamento síncrono direto entre serviços de domínios distintos.

## Stack alvo

- **Linguagem:** TypeScript em todo o stack (frontend, backend, IaC).
- **Frontend web:** aplicação SPA/SSR (a definir na spec de cada app).
- **Backend:** serviços containerizados em **ECS Fargate**.
- **Banco relacional:** **Aurora PostgreSQL** (região São Paulo).
- **Cache:** **Redis** (ElastiCache) para sessão e cache de leitura.
- **Mensageria/eventos:** **SQS** (filas) e **EventBridge** (barramento).
- **Arquivos:** **S3** para exames, imagens e documentos, com criptografia KMS.
- **CDN e borda:** **CloudFront** + **WAF**.
- **Identidade:** camada de identidade (Cognito ou equivalente) integrada ao
  módulo identity-access.
- **Segredos:** **Secrets Manager** (nunca segredos em código ou variáveis
  planas).
- **Observabilidade:** **CloudWatch** + **OpenTelemetry**.
- **IaC:** **AWS CDK com TypeScript**. Infraestrutura nunca provisionada
  manualmente pelo console em ambientes compartilhados.

## Decisões firmes

- **Não usar Kubernetes/EKS no início.** ECS Fargate atende a escala inicial com
  menor custo e complexidade. Reavaliar só quando houver necessidade real.
- **Região primária: `sa-east-1` (São Paulo).** Dados primários de pacientes
  residem no Brasil.
- **Ambientes separados por conta AWS:** desenvolvimento, homologação e
  produção, sob AWS Organizations.
- **Autenticar no Kiro não concede permissão de deploy.** Implantação usa perfis
  e funções IAM separados, com aprovação explícita.

## Regras de implementação

- Todo acesso a dados passa por camada de repositório que aplica o filtro de
  `tenant_id`.
- Contratos de API e eventos são versionados. Mudanças incompatíveis exigem nova
  versão.
- Configuração vem de variáveis de ambiente e Secrets Manager, nunca hardcoded.
- Nenhum recurso AWS é criado fora do CDK em ambientes compartilhados.
- Testes automatizados e verificações impedem merge de código incompleto.
