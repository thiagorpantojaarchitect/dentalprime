/**
 * Configuracao do admin-portal, lida das variaveis de ambiente do Vite (prefixo
 * VITE_). Nunca conter segredos: o bundle do frontend e publico.
 *
 * O portal de administracao consome apenas o servico de identidade
 * (identity-access), que expoe a gestao de rede (tenants, unidades, usuarios).
 */

interface ImportMetaEnvLike {
  readonly VITE_API_BASE_URL?: string;
  readonly VITE_IDENTITY_URL?: string;
}

function readEnv(): ImportMetaEnvLike {
  // import.meta.env e injetado pelo Vite; em testes pode nao existir.
  return (import.meta as unknown as { env?: ImportMetaEnvLike }).env ?? {};
}

export interface ServiceUrls {
  readonly identity: string;
}

export function getServiceUrls(): ServiceUrls {
  const env = readEnv();
  const apiBaseUrl = env.VITE_API_BASE_URL?.trim().replace(/\/$/, "");
  return {
    identity: env.VITE_IDENTITY_URL ?? `${apiBaseUrl ?? ""}/api/identity`,
  };
}
