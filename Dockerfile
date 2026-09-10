# Dockerfile parametrizado para os servicos de backend do DentalPrime.
#
# Monorepo npm workspaces: o build usa o contexto da raiz. Escolha o servico
# com o build arg SERVICE (ex.: identity-access) e a porta com PORT.
#
# Multi-stage:
#   - build:     instala deps (com dev), compila core + servico (tsc --build).
#   - prod-deps: instala apenas dependencias de producao.
#   - runtime:   imagem final enxuta, usuario nao-root, healthcheck em /health.
#
# Seguranca: nenhum segredo entra na imagem. DATABASE_URL e montado em runtime
# pelo entrypoint a partir de variaveis/segredos injetados pelo ECS.

# syntax=docker/dockerfile:1

ARG NODE_VERSION=22.12.0

# --- build: compila o servico alvo ---
FROM node:${NODE_VERSION}-alpine AS build
ARG SERVICE
WORKDIR /app
# Contexto do monorepo (o .dockerignore mantem o contexto enxuto e sem segredos).
COPY . .
# Instalacao determinista com o lockfile da raiz (inclui todos os workspaces).
RUN npm ci
# Compila core + servico. As project references resolvem a ordem de build.
RUN npm run build --workspace @dentalprime/core \
  && npm run build --workspace "@dentalprime/${SERVICE}"

# --- prod-deps: apenas dependencias de producao ---
FROM node:${NODE_VERSION}-alpine AS prod-deps
WORKDIR /app
COPY . .
RUN npm ci --omit=dev

# --- runtime: imagem final ---
FROM node:${NODE_VERSION}-alpine AS runtime
ARG SERVICE
ARG PORT=3000
ENV NODE_ENV=production \
    SERVICE=${SERVICE} \
    PORT=${PORT}
WORKDIR /app

# tini como init (reaper de processos) e healthcheck via wget (busybox).
RUN apk add --no-cache tini

# node_modules de producao (hoisted na raiz) e manifest raiz.
COPY --from=prod-deps /app/node_modules ./node_modules
COPY --from=prod-deps /app/package.json ./package.json

# Artefatos compilados e manifests do core e do servico.
COPY --from=build /app/packages/core/package.json ./packages/core/package.json
COPY --from=build /app/packages/core/dist ./packages/core/dist
COPY --from=build /app/services/${SERVICE}/package.json ./services/${SERVICE}/package.json
COPY --from=build /app/services/${SERVICE}/dist ./services/${SERVICE}/dist
# Migracoes SQL (drizzle) usadas pelo runner de migracao dist/migrate.js.
COPY --from=build /app/services/${SERVICE}/drizzle ./services/${SERVICE}/drizzle

# Entrypoint que monta DATABASE_URL e inicia o processo.
COPY docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh
RUN chmod +x /usr/local/bin/docker-entrypoint.sh

# Usuario nao-root (a imagem node ja traz o usuario "node").
USER node

EXPOSE ${PORT}

# Healthcheck bate no endpoint /health do proprio servico.
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider "http://127.0.0.1:${PORT}/health" || exit 1

ENTRYPOINT ["/sbin/tini", "--", "/usr/local/bin/docker-entrypoint.sh"]
