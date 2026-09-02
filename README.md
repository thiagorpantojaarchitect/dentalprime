# DentalPrime

Plataforma brasileira de gestão para clínicas e redes odontológicas: CRM, agenda
inteligente, prontuário clínico, plano de tratamento, financeiro e recepção por
IA. Português primeiro, dados primários no Brasil (AWS `sa-east-1`), arquitetura
multi-tenant preparada para exportação.

## Estado atual

Fundação documental do projeto. Ainda **não há código de aplicação nem
infraestrutura provisionada**. Esta fase estabelece visão, arquitetura, modelo
de dados, padrões e as specs dos primeiros módulos, para orientar a
implementação por Kiro, Codex ou qualquer agente/dev.

## Estrutura do repositório

```
DentalPrime/
├── .kiro/
│   ├── steering/       # regras sempre aplicadas (visão, arquitetura, segurança, código, clínica)
│   └── specs/          # specs por módulo (requirements → design → tasks)
├── apps/               # aplicações (clinic-web, patient-mobile, professional-mobile, admin-portal)
├── services/           # serviços de backend por domínio
├── packages/           # bibliotecas compartilhadas
├── infrastructure/     # IaC (AWS CDK, TypeScript)
├── documentation/      # PRD, arquitetura AWS, modelo de dados
└── AGENTS.md           # regras compartilhadas entre agentes (Kiro/Codex)
```

## Por onde começar

1. Leia `AGENTS.md` e os arquivos em `.kiro/steering/`.
2. Leia o PRD em `documentation/PRD.md`.
3. Veja a arquitetura em `documentation/architecture-aws.md` e o modelo de dados
   em `documentation/data-model.md`.
4. Consulte as specs em `.kiro/specs/`.

## Módulos

| Módulo | Status da spec |
|---|---|
| identity-access | Completa (requirements, design, tasks) |
| patient-record | Completa (requirements, design, tasks) |
| smart-scheduling | Completa (requirements, design, tasks) |
| treatment-plan | Stub de escopo |
| finance | Stub de escopo |
| crm-growth | Stub de escopo |
| ai-front-desk | Stub de escopo |

## Divisão de responsabilidades

- **Kiro / Codex** — desenvolvem o software.
- **GitHub** — fonte única do código.
- **AWS** — infraestrutura onde o produto roda (criada por código, com
  aprovação).
- **Bedrock / OpenAI / modelos privados** — IA consumida pelo produto em
  produção (distinta da IA de desenvolvimento).

## Princípios inegociáveis

Segurança e LGPD por padrão, segurança clínica (software apoia, não substitui o
julgamento clínico), multi-tenant por `tenant_id`, TypeScript em todo o stack,
testes obrigatórios. Detalhes em `.kiro/steering/`.
