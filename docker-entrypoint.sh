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
#   DATABASE_SSLMODE   modo TLS do Postgres (padrao verify-full)
#   DATABASE_CA_CERT_PATH caminho opcional para o bundle CA montado em runtime
#   JWT_SECRET         segredo JWT compartilhado (ja lido pelo servico)
#   DATABASE_URL       se ja fornecido, e respeitado (nao sobrescreve)

set -eu

if [ -n "${DATABASE_CA_CERT_PATH:-}" ]; then
  if [ ! -r "${DATABASE_CA_CERT_PATH}" ]; then
    echo "DATABASE_CA_CERT_PATH nao pode ser lido" >&2
    exit 1
  fi
  export NODE_EXTRA_CA_CERTS="${DATABASE_CA_CERT_PATH}"
fi

if [ -z "${DATABASE_URL:-}" ]; then
  db_port="${DATABASE_PORT:-5432}"
  sslmode="${DATABASE_SSLMODE:-verify-full}"

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

# Em ambiente compartilhado, criptografar sem validar identidade do servidor
# nao e suficiente. Development local tambem usa verify-full no Compose.
if [ "${NODE_ENV:-production}" = "production" ]; then
  # Analisa a URL de verdade em vez de aceitar uma correspondencia textual que
  # poderia aparecer em outro parametro. O script nunca imprime a URL.
  node --input-type=module <<'NODE'
let databaseUrl;
try {
  databaseUrl = new URL(process.env.DATABASE_URL);
} catch {
  console.error("DATABASE_URL de production e invalida");
  process.exit(1);
}

if (
  !["postgres:", "postgresql:"].includes(databaseUrl.protocol) ||
  databaseUrl.searchParams.get("sslmode") !== "verify-full"
) {
  console.error("DATABASE_URL de production deve usar PostgreSQL com sslmode=verify-full");
  process.exit(1);
}
NODE
fi

# Modo de execucao: "serve" (padrao) inicia o servidor HTTP; "migrate" aplica as
# migracoes do banco; "bootstrap" cria o primeiro tenant somente em development.
# A mesma imagem serve os casos; o CDK troca RUN_MODE na task de migracao.
run_mode="${RUN_MODE:-serve}"

case "$run_mode" in
  migrate)
    echo "Aplicando migracoes do servico ${SERVICE:-desconhecido}"
    exec node "services/${SERVICE}/dist/migrate.js"
    ;;
  serve)
    # Nao logamos DATABASE_URL nem segredos. Apenas um indicativo de inicializacao.
    echo "Iniciando servico ${SERVICE:-desconhecido} na porta ${PORT:-3000}"
    exec node "services/${SERVICE}/dist/main.js"
    ;;
  bootstrap)
    if [ "${SERVICE:-}" != "identity-access" ]; then
      echo "RUN_MODE=bootstrap e exclusivo do identity-access" >&2
      exit 1
    fi
    if [ "${NODE_ENV:-}" != "development" ] || [ "${ALLOW_DEVELOPMENT_BOOTSTRAP:-}" != "true" ]; then
      echo "Bootstrap bloqueado fora do development autorizado" >&2
      exit 1
    fi
    echo "Executando bootstrap fechado de development"
    exec node "services/identity-access/dist/bootstrap-development.js"
    ;;
  *)
    echo "RUN_MODE invalido: ${run_mode} (use 'serve', 'migrate' ou 'bootstrap')" >&2
    exit 1
    ;;
esac
