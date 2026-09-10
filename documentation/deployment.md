# Containerizacao e CI/CD — DentalPrime

> Este documento descreve como os servicos sao empacotados em imagens de
> container e como o pipeline de integracao e entrega funciona. Nenhum deploy
> ocorre automaticamente: a implantacao na AWS e um passo manual, com aprovacao
> explicita e credenciais dedicadas. Autenticar no Kiro ou no CI nao concede
> permissao de deploy.

## Imagens de container

Um unico `Dockerfile` parametrizado (na raiz) serve os sete servicos de
backend. O contexto de build e o monorepo inteiro (workspaces npm); o
`.dockerignore` mantem o contexto enxuto e sem segredos.

- **Build arg `SERVICE`** — nome do servico (ex.: `identity-access`).
- **Build arg `PORT`** — porta HTTP (3001-3007).
- **Estagios:** `build` (instala deps e compila core + servico com
  `tsc --build`), `prod-deps` (apenas dependencias de producao) e `runtime`
  (Node 22 alpine, usuario nao-root `node`, `tini` como init, `HEALTHCHECK` em
  `/health`).

Exemplo de build local (requer Docker):

```bash
docker build \
  --build-arg SERVICE=identity-access \
  --build-arg PORT=3001 \
  -t dentalprime/identity-access:dev .
```

### Configuracao em runtime

O `docker-entrypoint.sh` monta `DATABASE_URL` a partir de partes injetadas pelo
ECS:

- Nao-segredos por variavel de ambiente: `DATABASE_HOST`, `DATABASE_PORT`,
  `DATABASE_NAME`, `NODE_ENV`, `PORT`.
- Segredos por injecao do Secrets Manager em runtime: `DATABASE_USERNAME`,
  `DATABASE_PASSWORD`, `JWT_SECRET`.

Nenhum segredo entra na imagem nem e registrado em log. Se `DATABASE_URL` ja for
fornecida, ela e respeitada (util para casos com caracteres especiais na senha).

## Registro de imagens (ECR)

O `ComputeStack` (CDK) cria um repositorio ECR por servico:
`dentalprime/<servico>`, com scan on push, tags imutaveis, criptografia KMS e
politica de ciclo de vida (mantem as ultimas imagens). As task definitions do
ECS Fargate consomem a imagem na tag informada por `-c imageTag=<sha>`.

## Pipelines (GitHub Actions)

### `ci.yml` — verificacao (automatico)

Roda em pull requests e push para `main`. Nao acessa a AWS.

1. `npm ci`, `npm run build` (tsc dos servicos/packages) e build do clinic-web.
2. `npm run lint` e `npm run format:check`.
3. `npm test` (backend, core, infraestrutura) e testes do clinic-web.
4. Build (sem push) da imagem de cada servico em matriz, validando o Dockerfile.

### `release.yml` — build/push + cdk diff (manual)

Acionado por `workflow_dispatch`, com escolha do ambiente. Autentica na AWS por
OIDC (sem chaves estaticas).

1. Build e **push** da imagem de cada servico para o ECR, na tag do commit
   (`github.sha`).
2. `cdk diff` do ambiente escolhido com a tag deste commit.

O workflow **nao** faz `cdk deploy`. A implantacao e feita a parte, apos
revisao do diff e aprovacao.

#### Pre-requisitos de OIDC

- Variavel de repositorio `AWS_ACCOUNT_ID` (e, opcionalmente, `AWS_OIDC_ROLE`
  com o ARN completo da role).
- Uma IAM Role com trust para o provedor OIDC do GitHub e permissao minima para
  push no ECR e leitura para `cdk diff`. A role e criada fora deste fluxo (IaC
  de bootstrap ou processo de seguranca), nunca com chaves estaticas.

## Migracoes de banco

Cada servico tem migracoes SQL geradas pelo Drizzle (`services/<servico>/drizzle`)
e um runner idempotente (`dist/migrate.js`) que aplica apenas o que falta,
mantendo uma tabela de controle. A mesma imagem de container roda em dois modos,
selecionados pela variavel `RUN_MODE`:

- `serve` (padrao) — inicia o servidor HTTP.
- `migrate` — aplica as migracoes e encerra.

O `ComputeStack` cria, por servico, uma task definition de migracao
(`dentalprime-<servico>-migrate-<env>`) com `RUN_MODE=migrate`, os mesmos
segredos e a mesma imagem do servico.

### Ordem no deploy

As migracoes devem ser aplicadas **antes** de rotar as tasks dos servicos:

```bash
# 1) Aplicar migracoes (RunTask one-off) para cada servico, ex.:
aws ecs run-task \
  --cluster dentalprime-cluster-staging \
  --task-definition dentalprime-identity-access-migrate-staging \
  --launch-type FARGATE \
  --network-configuration "awsvpcConfiguration={subnets=[<privadas>],securityGroups=[<sg-servicos>],assignPublicIp=DISABLED}"

# 2) Depois, implantar/rotar os servicos (cdk deploy do compute).
```

Regra de seguranca clinica: migracoes preservam o historico; alteracoes de
schema em dados clinicos nao removem informacao de forma destrutiva.

## Deploy com aprovacao (`deploy.yml`)

O deploy e um workflow manual (`workflow_dispatch`) com gate de aprovacao pela
protecao de **GitHub Environments**. O job so executa apos aprovacao humana dos
reviewers configurados no Environment escolhido.

Fluxo do workflow:

1. Autentica na AWS por OIDC com uma role de **deploy** dedicada por ambiente
   (`AWS_DEPLOY_ROLE` ou o padrao `dentalprime-deploy-<env>`), separada da role
   de CI/ECR.
2. Aplica as **migracoes** de cada servico via `aws ecs run-task` e aguarda a
   conclusao (falha o deploy se alguma migracao retornar exitCode != 0).
3. Executa `cdk deploy --all` com a tag de imagem do deploy.

### Configuracao necessaria (por Environment do GitHub)

- Protecao do Environment com **required reviewers** (obrigatorio para `staging`
  e `production`; producao com reviewers adicionais).
- Variaveis do Environment: `AWS_ACCOUNT_ID`, opcional `AWS_DEPLOY_ROLE`,
  `PRIVATE_SUBNET_IDS` (lista separada por virgula) e
  `SERVICE_SECURITY_GROUP_ID` (SG das tasks, saida do ComputeStack).

### Deploy manual (operador autorizado)

Alternativa fora do pipeline, apos aprovar o `cdk diff`:

```bash
cd infrastructure
# 1) migracoes (uma por servico), depois:
npx cdk deploy --all -c env=staging -c imageTag=<sha> --require-approval never
```

Producao exige aprovacao adicional e respeita a residencia de dados em
`sa-east-1`. Recursos stateful tem protecao de remocao habilitada. Autenticar no
Kiro ou no CI nao concede permissao de deploy: o deploy usa roles IAM dedicadas.
