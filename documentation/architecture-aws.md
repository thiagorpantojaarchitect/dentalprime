# Arquitetura AWS — DentalPrime

> Documento de referência da infraestrutura alvo. Nada aqui é provisionado nesta
> fundação. Toda infraestrutura será criada por código (AWS CDK, TypeScript) e
> implantada com aprovação explícita. Nomes de recursos usam hífens.

## 1. Princípios

- **Well-Architected**: segurança, confiabilidade, eficiência de performance,
  otimização de custo, excelência operacional e sustentabilidade.
- **Segurança e LGPD por padrão** (ver `.kiro/steering/security-lgpd.md`).
- **Simplicidade antes de escala**: começar com serviços gerenciados e sem EKS.
- **Infraestrutura como código**: nenhum recurso criado manualmente pelo console
  em ambientes compartilhados.
- **Residência de dados no Brasil**: região primária `sa-east-1` (São Paulo).

## 2. Organização de contas

Sob **AWS Organizations**, contas separadas por ambiente para isolamento de
blast radius e billing:

| Conta | Uso |
|---|---|
| management | Raiz da organização, billing consolidado, SCPs |
| security | Log archive, auditoria, agregação de segurança |
| shared-services | Recursos comuns (registry de imagens, CI/CD) |
| development | Ambiente de desenvolvimento |
| staging | Homologação |
| production | Produção |

- **SCPs** (Service Control Policies) restringem regiões e ações sensíveis.
- **Autenticar no Kiro não concede deploy.** Implantação usa funções IAM
  dedicadas por ambiente, com privilégio mínimo e aprovação.

## 3. Rede

- VPC por ambiente, subnets públicas e privadas em múltiplas AZs.
- Recursos de dados (Aurora, Redis) em subnets privadas, sem acesso público.
- Saída controlada via NAT; entrada via ALB atrás de CloudFront/WAF.
- VPC endpoints para serviços AWS (S3, Secrets Manager) evitando tráfego pela
  internet.

## 4. Computação

- **ECS Fargate** para os serviços de backend (containers sem gerenciar
  servidores). Um serviço por domínio ou agrupamento coeso.
- **Application Load Balancer** distribuindo para os serviços.
- Autoscaling por métricas de uso.
- **Sem Kubernetes/EKS** nesta fase (decisão firme em
  `.kiro/steering/architecture.md`).

## 5. Dados

- **Aurora PostgreSQL** (região São Paulo) como banco relacional principal.
  Multi-AZ em produção. Isolamento multi-tenant por `tenant_id` na camada de
  aplicação/repositório.
- **ElastiCache (Redis)** para cache de leitura e sessão.
- **S3** para exames, imagens e documentos clínicos, com criptografia KMS e
  políticas de acesso restritas.
- Toda persistência com **criptografia em repouso (KMS)** e **em trânsito
  (TLS)**.

## 6. Mensageria e eventos

- **EventBridge** como barramento de eventos de domínio.
- **SQS** para filas e processamento assíncrono, com dead-letter queues.
- Comunicação entre domínios preferencialmente assíncrona por eventos.

## 7. Borda e entrega

- **CloudFront** como CDN e ponto de entrada.
- **WAF** para proteção de camada de aplicação (regras gerenciadas, rate
  limiting).
- Certificados TLS gerenciados (ACM). Domínio e DNS via Route 53.

## 8. Identidade

- Camada de identidade (**Cognito** ou equivalente) integrada ao módulo
  `identity-access`. Suporta autenticação de equipe clínica, administrativo e
  pacientes, com RBAC e isolamento por tenant.
- Autorização de aplicação (papéis clínicos, permissões por tenant) é
  responsabilidade do módulo identity-access, complementando a identidade.

## 9. Segredos e criptografia

- **Secrets Manager** para todos os segredos (credenciais de banco, chaves de
  API de fornecedores de IA, tokens). Nunca em código, variáveis planas, logs ou
  imagens de container. Resolvidos em **runtime**.
- **KMS** para chaves de criptografia (banco, S3, backups), com rotação.

## 10. Observabilidade

- **CloudWatch** (logs, métricas, alarmes, dashboards).
- **OpenTelemetry** para tracing distribuído entre serviços.
- Logs sem dados sensíveis ou segredos em texto claro.

## 11. Segurança e auditoria

- **CloudTrail** para trilha de auditoria de API da AWS.
- **GuardDuty** para detecção de ameaças.
- **Security Hub** para postura de segurança consolidada.
- **AWS Backup** com retenção imutável para dados clínicos e financeiros,
  atendendo prazos legais de guarda de prontuário.
- Trilha de auditoria de aplicação (acesso/alteração de dados sensíveis) é
  responsabilidade dos módulos e complementa o CloudTrail.

## 12. IA do produto

- Integração com **Amazon Bedrock** e/ou **OpenAI API** e/ou modelos privados,
  por caso de uso. Chaves via Secrets Manager.
- A camada de IA é plugável; o produto não fica preso a um fornecedor.
- Fluxos de IA respeitam LGPD e segurança clínica: minimização de dados, sem
  vazamento a terceiros não autorizados, saídas assistivas com revisão humana
  quando influenciam cuidado.

## 13. IaC e implantação

- **AWS CDK com TypeScript** em `infrastructure/`.
- Stacks por ambiente e por domínio, com parametrização.
- Pipeline de CI/CD (a definir) executa build, testes, `cdk diff` e implantação
  com aprovação para staging/produção.
- Ambientes não compartilham dados: produção nunca replica dados reais para
  dev/staging.

## 14. Evolução

Reavaliar decisões (ex.: EKS, multi-região, réplicas de leitura) apenas quando
métricas de escala, latência ou disponibilidade justificarem. Documentar cada
decisão de arquitetura relevante como ADR em `documentation/`.
