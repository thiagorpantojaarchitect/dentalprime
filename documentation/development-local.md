# Ambiente local de desenvolvimento

Este ambiente reproduz os sete serviços do DentalPrime com PostgreSQL 16 e
dados exclusivamente sintéticos. Nenhum recurso AWS é criado por estes
comandos.

## Pré-requisitos

- Node.js 22.12 ou superior;
- npm com suporte a workspaces;
- Docker com `docker compose`;
- simulador ou device configurado somente se for executar os apps Expo.

## Instalação limpa

Na raiz do projeto, use a instalação determinística registrada no lockfile:

```bash
npm ci
npm run build
npm run build:web
npm run test:apps
```

Os apps mobile usam React 19/React Native por exigência do Expo, enquanto os
portais web usam React 18. O resolvedor de workspaces mantém as versões
incompatíveis em diretórios separados quando necessário.

## Subir banco e serviços

Crie a configuração local a partir do exemplo e substitua os placeholders de
senha/JWT. O arquivo `.env` é ignorado pelo Git e não deve ser compartilhado.

```bash
cp .env.example .env
npm run dev:backend
```

O Compose:

1. gera um certificado TLS efêmero para o hostname `postgres`;
2. inicia o PostgreSQL aceitando conexões de rede somente com TLS;
3. inicia o MinIO local e cria o bucket privado de documentos clínicos;
4. executa as migrações em sete schemas separados;
5. inicia os sete serviços como usuário não-root;
6. aguarda a readiness HTTP, incluindo banco e schema.

Schemas usados: `identity_access`, `patient_record`, `smart_scheduling`,
`treatment_plan`, `finance`, `crm_growth` e `ai_front_desk`.

O serviço de recepção usa `AI_PROVIDER=stub` somente porque
`DEPLOYMENT_ENV=development`; essa combinação é passada também à migração e é
rejeitada pelo backend em staging/produção.

Os publicadores de eventos usam `EVENT_PROVIDER=noop` de forma explícita neste
Compose. Staging e produção recusam esse modo; no ECS, os serviços de agenda,
tratamento e financeiro usam `eventbridge` e exigem o nome do barramento.

Na primeira execução, crie o tenant e o owner sintéticos pelo comando fechado
(não existe endpoint HTTP de bootstrap):

```bash
npm run bootstrap:development
```

O script raiz ativa o profile `bootstrap` do Compose; somente esse serviço
one-shot injeta `ALLOW_DEVELOPMENT_BOOTSTRAP=true`. O entrypoint ainda exige
`SERVICE=identity-access` e `NODE_ENV=development`. O bootstrap é auditado e se
recusa a criar um segundo tenant quando o banco já foi inicializado. Ao terminar,
ele imprime o `tenantId` (inclusive quando a inicialização já existia); use esse
valor no primeiro login e troque imediatamente a senha inicial.

`CLINICAL_DOCUMENTS_BUCKET` é criado automaticamente no MinIO e as URLs
assinadas apontam para `http://localhost:9000`. A edição comunitária fixada usa
o CORS global do servidor, configurado explicitamente apenas para os dois
portais locais; a CI comprova o preflight antes de continuar. O console opcional
fica em `http://localhost:9001`. Use somente arquivos sintéticos; nunca aponte
esse ambiente para o bucket de produção. Em AWS, o endpoint customizado é
bloqueado e o SDK usa S3/KMS com a role da task.

Para executar também a prova HTTP agregada, que só termina com sucesso depois
que todos os contêineres estão saudáveis:

```bash
npm run smoke:backend
```

Na CI, o gate integrado vai além da readiness: em um PostgreSQL efêmero ele
executa o bootstrap fechado, faz login, convida e ativa uma conta uma única vez,
vincula essa conta a um paciente sintético, consulta `/patients/me`, comprova a
rotação de refresh token e atravessa a agenda com catálogo, disponibilidade,
bloqueio, concorrência real e isolamento por unidade. Tokens e senhas não são
impressos.

O certificado local fica no volume Docker `postgres-tls`. Para AWS, a imagem
baixa por HTTPS e valida no build o bundle raiz oficial do RDS em `sa-east-1`.
Uma política centralizada pode substituí-lo por volume e informar o novo caminho
com `DATABASE_CA_CERT_PATH`. Em `production`, o entrypoint analisa a URL e
rejeita conexões que não sejam PostgreSQL com `sslmode=verify-full`.

## Portais web

Com o backend saudável, execute em terminais separados:

```bash
npm run dev --workspace @dentalprime/clinic-web
npm run dev --workspace @dentalprime/admin-portal
```

O clinic-web fica em `http://localhost:5173` e o admin-portal em
`http://localhost:5174`. Os proxies do Vite removem `/api/<domínio>` antes de
encaminhar à rota Fastify. Builds publicados não dependem desses proxies: a
borda AWS implementa o mesmo contrato.

Nos portais, os tokens permanecem em `sessionStorage` e são removidos quando a
aba é fechada; os apps mobile usam SecureStore do sistema operacional. Nenhum
token deve ser colocado em URL ou log.

Para inicializar a agenda de uma unidade nova no clinic-web: convide o usuário
do profissional, copie seu ID, abra **Agenda**, informe a unidade, cadastre o
profissional e os recursos, registre ao menos uma janela **Disponível** e só
então crie o agendamento. O backend rejeita horários fora da disponibilidade,
bloqueios e sobreposição de profissional ou recurso; as restrições no
PostgreSQL também protegem reservas concorrentes.

As listagens administrativas usam paginação server-side de dez itens. O portal
envia `page`/`pageSize` e respeita `hasMore`, portanto registros depois da
primeira página não são descartados no navegador.

## Apps mobile

```bash
npm run start --workspace @dentalprime/patient-mobile
npm run start --workspace @dentalprime/professional-mobile
```

O fallback `localhost` atende o simulador iOS. Para Android emulator ou device
físico, use os overrides públicos `EXPO_PUBLIC_IDENTITY_URL`,
`EXPO_PUBLIC_PATIENT_URL` e `EXPO_PUBLIC_SCHEDULING_URL` com um host alcançável.
Para um ambiente AWS, basta `EXPO_PUBLIC_API_BASE_URL=https://<domínio>`; o
config acrescenta os caminhos `/api/...`. Variáveis `EXPO_PUBLIC_*` entram no
bundle e nunca podem guardar segredos.

No app do paciente, a clínica deve primeiro convidar uma conta com papel
`patient` e usar **Usuários → Vincular acesso do paciente** para associar o ID
desse usuário ao prontuário. Depois disso, o app consulta somente
`/patients/me`; não há campo para informar um ID de prontuário.

## Encerrar

```bash
docker compose down
```

Esse comando preserva banco e certificado locais. Para apagar definitivamente
somente os dados sintéticos deste Compose, execute conscientemente
`docker compose down --volumes`.
