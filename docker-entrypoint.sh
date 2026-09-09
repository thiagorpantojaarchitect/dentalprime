#!/bin/sh
# Entrypoint dos servicos de backend.
#
# Monta DATABASE_URL a partir de partes injetadas pelo ECS (host/porta/nome nao
# sao segredos; usuario e senha vem do Secrets Manager em runtime). Nunca loga
# valores de segredo. Em seguida inicia o processo do servico.
#
# Variaveis esperadas:
#   SERVICE            nome do servico (ex.: identity-access) — definido na imagem
#   PORT               porta HTTP — definido na imagem
#   DATABASE_HOST      host do banco
#   DATABASE_PORT      porta do banco (padrao 5432)
#   DATABASE_NAME      nome do banco
#   DATABASE_USERNAME  usuario (segredo)
#   DATABASE_PASSWORD  senha (segredo)
#   DATABASE_SSLMODE   modo TLS do Postgres (padrao require)
#   JWT_SECRET         segredo JWT compartilhado (ja lido pelo servico)
#   DATABASE_URL       se ja fornecido, e respeitado (nao sobrescreve)

set -eu

if [ -z "${DATABASE_URL:-}" ]; then
  db_port="${DATABASE_PORT:-5432}"
  sslmode="${DATABASE_SSLMODE:-require}"

  : "${DATABASE_HOST:?DATABASE_HOST ausente}"
  : "${DATABASE_NAME:?DATABASE_NAME ausente}"
  : "${DATABASE_USERNAME:?DATABASE_USERNAME ausente}"
  : "${DATABASE_PASSWORD:?DATABASE_PASSWORD ausente}"

  # As credenciais geradas no Secrets Manager usam apenas caracteres seguros de
  # URL (excludePunctuation), portanto podem ser usadas diretamente. Se a senha
  # for definida manualmente com caracteres reservados, ela deve ser fornecida
  # ja como DATABASE_URL completa (respeitada acima) para evitar codificacao
  # fragil em shell.
  export DATABASE_URL="postgresql://${DATABASE_USERNAME}:${DATABASE_PASSWORD}@${DATABASE_HOST}:${db_port}/${DATABASE_NAME}?sslmode=${sslmode}"
fi

# Nao logamos DATABASE_URL nem segredos. Apenas um indicativo de inicializacao.
echo "Iniciando servico ${SERVICE:-desconhecido} na porta ${PORT:-3000}"

exec node "services/${SERVICE}/dist/main.js"
