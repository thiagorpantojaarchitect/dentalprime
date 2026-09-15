# Dockerfile parametrizado para os servicos de backend do DentalPrime.
#
# Monorepo npm workspaces: o build usa o contexto da raiz. Escolha o servico
# com o build arg SERVICE (ex.: identity-access) e a porta com PORT.
#
# Multi-stage:
#   - build:     instala deps (com dev), compila core + servico (tsc --build).
#   - prod-deps: instala apenas dependencias de producao.
#   - runtime:   imagem final enxuta, usuario nao-root, readiness em /ready.
#
# Seguranca: nenhum segredo entra na imagem. DATABASE_URL e montado em runtime
# pelo entrypoint a partir de variaveis/segredos injetados pelo ECS.

# syntax=docker/dockerfile:1

# --- manifests: camada compartilhada entre os sete builds ---
FROM node:22.23.2-alpine3.24@sha256:c610fcdfb1d5b4740dd70c284ed3cb16bb857e0f7166196e36a5501df7a3aa32 AS workspace-manifests
WORKDIR /app
# Copiar apenas os manifests antes do codigo preserva o cache de `npm ci` em
# alteracoes comuns de TypeScript. Todos os workspaces precisam existir para o
# npm reconstruir corretamente os links do monorepo.
COPY package.json package-lock.json ./
COPY apps/admin-portal/package.json ./apps/admin-portal/package.json
COPY apps/clinic-web/package.json ./apps/clinic-web/package.json
COPY apps/patient-mobile/package.json ./apps/patient-mobile/package.json
COPY apps/professional-mobile/package.json ./apps/professional-mobile/package.json
COPY infrastructure/package.json ./infrastructure/package.json
COPY packages/core/package.json ./packages/core/package.json
COPY packages/mobile-core/package.json ./packages/mobile-core/package.json
COPY packages/observability/package.json ./packages/observability/package.json
COPY services/ai-front-desk/package.json ./services/ai-front-desk/package.json
COPY services/crm-growth/package.json ./services/crm-growth/package.json
COPY services/finance/package.json ./services/finance/package.json
COPY services/identity-access/package.json ./services/identity-access/package.json
COPY services/patient-record/package.json ./services/patient-record/package.json
COPY services/smart-scheduling/package.json ./services/smart-scheduling/package.json
COPY services/treatment-plan/package.json ./services/treatment-plan/package.json

# --- build: compila o servico alvo ---
FROM workspace-manifests AS build
# Instalacao determinista com o lockfile da raiz (inclui todos os workspaces).
# O cache guarda somente pacotes baixados; node_modules continua sendo criado
# do zero e validado pelo lockfile em cada camada nova.
RUN --mount=type=cache,target=/root/.npm npm ci
ARG SERVICE
# Falha cedo quando o build arg estiver ausente ou apontar para outro diretorio.
RUN case "${SERVICE}" in \
      identity-access|patient-record|smart-scheduling|treatment-plan|finance|crm-growth|ai-front-desk) ;; \
      *) echo "SERVICE invalido" >&2; exit 1 ;; \
    esac
# Contexto do monorepo (o .dockerignore mantem o contexto enxuto e sem segredos).
COPY . .
# Compila os pacotes compartilhados usados no runtime e o servico.
RUN npm run build --workspace @dentalprime/core \
  && npm run build --workspace @dentalprime/observability \
  && npm run build --workspace "@dentalprime/${SERVICE}"

# --- prod-deps: apenas dependencias de producao ---
FROM workspace-manifests AS prod-deps
ARG SERVICE
RUN case "${SERVICE}" in \
      identity-access|patient-record|smart-scheduling|treatment-plan|finance|crm-growth|ai-front-desk) ;; \
      *) echo "SERVICE invalido" >&2; exit 1 ;; \
    esac
RUN --mount=type=cache,target=/root/.npm \
    npm ci --omit=dev --include-workspace-root=false \
    --workspace @dentalprime/core \
    --workspace @dentalprime/observability \
    --workspace "@dentalprime/${SERVICE}"

# --- runtime: imagem final ---
FROM node:22.23.2-alpine3.24@sha256:c610fcdfb1d5b4740dd70c284ed3cb16bb857e0f7166196e36a5501df7a3aa32 AS runtime
ARG SERVICE
ARG PORT=3000
ENV NODE_ENV=production \
    SERVICE=${SERVICE} \
    PORT=${PORT} \
    DATABASE_CA_CERT_PATH=/etc/dentalprime/rds/sa-east-1-bundle.pem
WORKDIR /app

# tini como init, CAs do sistema e o bundle raiz oficial do RDS na regiao
# primaria. A AWS exige esse trust bundle para conexoes TLS verificadas. O
# download ocorre por HTTPS no build, e o Node valida o PEM antes de publica-lo.
# DATABASE_CA_CERT_PATH ainda pode ser sobrescrito por um volume em runtime.
RUN apk add --no-cache ca-certificates tini \
  && mkdir -p /etc/dentalprime/rds \
  && wget -q \
    -O /etc/dentalprime/rds/sa-east-1-bundle.pem \
    https://truststore.pki.rds.amazonaws.com/sa-east-1/sa-east-1-bundle.pem \
  && node -e 'require("node:tls").createSecureContext({ ca: require("node:fs").readFileSync("/etc/dentalprime/rds/sa-east-1-bundle.pem") })' \
  && chmod 0444 /etc/dentalprime/rds/sa-east-1-bundle.pem

# node_modules de producao (hoisted na raiz) e manifest raiz.
COPY --from=prod-deps /app/node_modules ./node_modules
COPY --from=prod-deps /app/package.json ./package.json

# Artefatos compilados e manifests do core e do servico.
COPY --from=build /app/packages/core/package.json ./packages/core/package.json
COPY --from=build /app/packages/core/dist ./packages/core/dist
COPY --from=build /app/packages/observability/package.json ./packages/observability/package.json
COPY --from=build /app/packages/observability/dist ./packages/observability/dist
COPY --from=build /app/services/${SERVICE}/package.json ./services/${SERVICE}/package.json
COPY --from=build /app/services/${SERVICE}/dist ./services/${SERVICE}/dist
# Migracoes SQL (drizzle) usadas pelo runner de migracao dist/migrate.js.
COPY --from=build /app/services/${SERVICE}/drizzle ./services/${SERVICE}/drizzle

# Smoke de resolucao dos modulos que detecta links de workspace quebrados antes
# da publicacao da imagem. O smoke HTTP completo fica no docker-compose.
RUN node --input-type=module -e \
  'await Promise.all([import("@dentalprime/core"), import("@dentalprime/observability")])' \
  && test -f "services/${SERVICE}/dist/main.js" \
  && test -f "services/${SERVICE}/dist/migrate.js" \
  && { [ "${SERVICE}" != "identity-access" ] \
    || test -f "services/identity-access/dist/bootstrap-development.js"; }

# Entrypoint que monta DATABASE_URL e inicia o processo.
COPY docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh
RUN chmod +x /usr/local/bin/docker-entrypoint.sh

# Usuario nao-root (a imagem node ja traz o usuario "node").
USER node

EXPOSE ${PORT}

# Readiness valida processo, banco e schema antes de aceitar trafego.
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider "http://127.0.0.1:${PORT}/ready" || exit 1

ENTRYPOINT ["/sbin/tini", "--", "/usr/local/bin/docker-entrypoint.sh"]
