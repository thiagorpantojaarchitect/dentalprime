/**
 * Configuracao do frontend, lida das variaveis de ambiente do Vite (prefixo
 * VITE_). Nunca conter segredos: o bundle do frontend e publico.
 */

interface ImportMetaEnvLike {
  readonly VITE_IDENTITY_URL?: string;
  readonly VITE_PATIENT_URL?: string;
  readonly VITE_SCHEDULING_URL?: string;
}

function readEnv(): ImportMetaEnvLike {
  // import.meta.env e injetado pelo Vite; em testes pode nao existir.
  return (import.meta as unknown as { env?: ImportMetaEnvLike }).env ?? {};
}

export interface ServiceUrls {
  readonly identity: string;
  readonly patient: string;
  readonly scheduling: string;
}

export function getServiceUrls(): ServiceUrls {
  const env = readEnv();
  return {
    identity: env.VITE_IDENTITY_URL ?? "http://localhost:3001",
    patient: env.VITE_PATIENT_URL ?? "http://localhost:3002",
    scheduling: env.VITE_SCHEDULING_URL ?? "http://localhost:3003",
  };
}
