# DentalPrime

Plataforma brasileira de gestão para clínicas e redes odontológicas. O
monorepo reúne identidade e acesso, prontuário clínico, agenda, planos de
tratamento, financeiro, CRM e recepção assistida por IA, além dos aplicativos
web, mobile e da infraestrutura AWS em CDK.

## Estado do projeto

O código está preparado para validação e provisionamento controlado de um ambiente AWS de **desenvolvimento**, com
dados exclusivamente sintéticos. O repositório contém:

- sete serviços TypeScript/Fastify com persistência PostgreSQL;
- `clinic-web` e `admin-portal` em React/Vite;
- aplicativos Expo para paciente e profissional;
- imagens Docker parametrizadas para os sete serviços;
- infraestrutura AWS CDK para rede, segurança, dados, mensageria, computação,
  borda e observabilidade;
- testes automatizados e workflows de integração e implantação.

Nenhum comando local provisiona a AWS automaticamente. A criação de recursos
exige credenciais, conta de desenvolvimento, revisão do diff e aprovação
explícita no pipeline.

## Arquitetura de desenvolvimento

O contrato público é same-origin e mantém os serviços internos desacoplados:

| Prefixo público | Serviço |
|---|---|
| `/api/identity` | `identity-access` |
| `/api/patients` | `patient-record` |
| `/api/scheduling` | `smart-scheduling` |
| `/api/treatment` | `treatment-plan` |
| `/api/finance` | `finance` |
| `/api/crm` | `crm-growth` |
| `/api/ai` | `ai-front-desk` |

Na AWS, CloudFront e WAF protegem a entrada, o ALB seleciona o domínio e remove
o prefixo antes de encaminhar a requisição ao Fastify. Os dados primários ficam
em `sa-east-1`. Cada serviço possui schema PostgreSQL e histórico de migração
exclusivos no cluster compartilhado de desenvolvimento.

## Pré-requisitos

- Node.js 22 ou superior;
- npm 11 ou superior;
- Docker com Compose v2 para o ambiente integrado local;
- AWS CLI e CDK somente para sintetizar, comparar ou implantar a infraestrutura.

## Instalação e verificações locais

```bash
npm ci
npm run build
npm run lint
npm run format:check
npm test
```

Os aplicativos mobile fazem parte dos workspaces e podem ser verificados com:

```bash
npm run typecheck --workspace @dentalprime/patient-mobile
npm run typecheck --workspace @dentalprime/professional-mobile
```

## Ambiente integrado com PostgreSQL

Crie a configuração local sem versionar segredos:

```bash
cp .env.example .env
docker compose --profile smoke up --build --abort-on-container-exit --exit-code-from smoke smoke
```

Esse fluxo cria certificados TLS locais, inicia PostgreSQL e MinIO, executa as
sete migrações em schemas separados, inicia as sete imagens e consulta seus
endpoints de saúde. O provedor de IA padrão é o stub determinístico, sem envio
de dados ou custo externo.

Na primeira execução, crie o tenant e o administrador sintéticos por um comando
fechado, sem endpoint público de bootstrap:

```bash
npm run bootstrap:development
```

Para remover apenas os contêineres e a rede:

```bash
docker compose down
```

Para apagar também o volume local de dados sintéticos, execute conscientemente:

```bash
docker compose down --volumes
```

## Aplicações web

Em desenvolvimento, o Vite encaminha os prefixos `/api/*` às portas locais dos
serviços. Em um terminal separado:

```bash
npm run dev --workspace @dentalprime/clinic-web
npm run dev --workspace @dentalprime/admin-portal
```

Builds destinados à AWS não devem receber URLs `localhost`; eles usam os
prefixos same-origin definidos nos arquivos `.env.example` de cada app.

## Infraestrutura AWS

A síntese não cria recursos:

```bash
npm run synth --workspace @dentalprime/infrastructure -- --strict -c env=development -c account=111111111111 -c desiredCount=0
```

O provisionamento greenfield é intencionalmente dividido em registro de
imagens, preparação do runtime com capacidade zero, migrações, ativação dos
serviços, publicação dos frontends e smoke test. Consulte
`documentation/deployment.md` antes de qualquer implantação.

## Segurança do desenvolvimento

- Use somente dados sintéticos.
- Nunca registre `.env`, tokens, senhas ou dados clínicos no Git.
- O `identity-access` interno é a fonte de verdade nesta fase; não há Cognito
  decorativo concorrendo com o fluxo real.
- Convites usam token expirável e de uso único. O primeiro tenant é criado por
  um bootstrap explícito e não público.
- Pacientes acessam apenas `/patients/me`, após vínculo explícito entre a conta
  convidada e o prontuário; a UI não aceita um ID escolhido pelo paciente.
- A agenda exige profissional, unidade e disponibilidade cadastrados e impede
  conflitos concorrentes de profissional ou recurso no próprio PostgreSQL.
- IA é assistiva: nenhuma saída substitui decisão, diagnóstico ou prescrição
  de um profissional.

## Estrutura

```text
DentalPrime/
├── .kiro/           regras e specs executáveis do projeto
├── apps/            clinic-web, admin-portal e aplicativos mobile
├── services/        sete serviços de domínio
├── packages/        contratos e bibliotecas compartilhadas
├── infrastructure/  stacks e testes AWS CDK
├── documentation/   arquitetura, operação e runbooks
└── .github/          integração, release e implantação controlada
```

Leia primeiro `AGENTS.md`, os arquivos em `.kiro/steering/` e a spec
`.kiro/specs/development-readiness/`. O PRD e as decisões de arquitetura estão
em `documentation/`.
