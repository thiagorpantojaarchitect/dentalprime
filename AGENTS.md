# AGENTS.md — DentalPrime

Regras compartilhadas para qualquer agente de desenvolvimento que trabalhe neste
repositório (Kiro, Codex e outros). Fonte única de verdade sobre como colaborar
aqui. Mantém consistência com os arquivos de steering em `.kiro/steering/`.

> A IA de desenvolvimento (Kiro/Codex) produz **código**. Ela não é a IA do
> produto e **não acessa dados reais de pacientes**. A camada de IA do produto
> (Bedrock, OpenAI, modelos privados) é assunto separado, documentada no PRD e
> nas specs.

## O produto

DentalPrime é uma plataforma brasileira de gestão para clínicas e redes
odontológicas: CRM, agenda inteligente, prontuário, plano de tratamento,
financeiro e recepção por IA. Português primeiro, dados primários no Brasil
(AWS `sa-east-1`), arquitetura multi-tenant preparada para exportação.

Detalhes em `.kiro/steering/product-vision.md` e `documentation/PRD.md`.

## Divisão de responsabilidades

- **Kiro / Codex** — desenvolvem o software (specs, implementação, testes,
  revisão).
- **GitHub** — fonte única do código.
- **AWS** — infraestrutura onde o produto roda (não é ferramenta obrigatória de
  programação).
- **Bedrock / OpenAI / modelos privados** — IA consumida pelo produto em
  produção.

Autenticar no Kiro (GitHub, Google, AWS Builder ID, IAM Identity Center) não
concede permissão de deploy na AWS. Implantação usa perfis e funções IAM
separados, com aprovação explícita.

## Como trabalhar aqui

1. Ler os arquivos de steering em `.kiro/steering/` antes de começar.
2. Trabalhar por specs em `.kiro/specs/<módulo>/` (requirements → design →
   tasks). Não implementar antes da spec do módulo estar acordada.
3. Branch por funcionalidade; nunca commitar direto em `main`.
4. Rodar build e testes relevantes antes de considerar uma tarefa concluída.
5. Não provisionar recursos AWS a partir de sessões de desenvolvimento.
   Infraestrutura é criada por código (CDK) e implantada com aprovação.

## Regras inegociáveis

Estas espelham os arquivos de steering e valem para todo agente:

- **Segurança e LGPD** (`.kiro/steering/security-lgpd.md`): dados clínicos são
  sensíveis. Criptografia com KMS, segredos no Secrets Manager resolvidos em
  runtime, RBAC, isolamento por tenant, auditoria. Nunca logar ou ecoar
  segredos/PII. Placeholders genéricos em exemplos e seeds.
- **Segurança clínica** (`.kiro/steering/clinical-safety.md`): software apoia,
  não substitui o julgamento clínico. Preservar histórico clínico
  (versionamento, não exclusão destrutiva). IA do produto é assistiva e
  identificada. Confirmar com o usuário antes de implementar fluxos que gerem ou
  alterem conteúdo clínico automaticamente.
- **Arquitetura** (`.kiro/steering/architecture.md`): monorepo, multi-tenant por
  `tenant_id`, backend por domínios, eventos assíncronos, TypeScript, ECS
  Fargate, Aurora PostgreSQL, CDK. Sem EKS no início. Região `sa-east-1`.
- **Padrões de código** (`.kiro/steering/coding-standards.md`): TypeScript
  `strict`, testes obrigatórios, lint limpo, sem segredos em commit. Código em
  inglês; documentação de negócio em português. Nomes de recursos AWS com
  hífens, nunca travessões.

## Estrutura do repositório

```
dentalprime/
├── .kiro/            # steering, specs, agents, hooks, skills (acompanha o repo)
├── apps/             # aplicações (web, mobile, portal admin)
├── services/         # serviços de backend por domínio
├── packages/         # bibliotecas compartilhadas
├── infrastructure/   # IaC (AWS CDK, TypeScript)
├── documentation/    # PRD, arquitetura AWS, modelo de dados
└── AGENTS.md         # este arquivo
```
