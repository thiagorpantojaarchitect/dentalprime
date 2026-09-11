/**
 * Configuracao do frontend, lida das variaveis de ambiente do Vite (prefixo
 * VITE_). Nunca conter segredos: o bundle do frontend e publico.
 */

interface ImportMetaEnvLike {
  readonly VITE_IDENTITY_URL?: string;
  readonly VITE_PATIENT_URL?: string;
  readonly VITE_SCHEDULING_URL?: string;
  readonly VITE_TREATMENT_URL?: string;
  readonly VITE_FINANCE_URL?: string;
  readonly VITE_CRM_URL?: string;
  readonly VITE_AI_URL?: string;
}

function readEnv(): ImportMetaEnvLike {
  // import.meta.env e injetado pelo Vite; em testes pode nao existir.
  return (import.meta as unknown as { env?: ImportMetaEnvLike }).env ?? {};
}

export interface ServiceUrls {
  readonly identity: string;
  readonly patient: string;
  readonly scheduling: string;
  readonly treatment: string;
  readonly finance: string;
  readonly crm: string;
  readonly ai: string;
}

export function getServiceUrls(): ServiceUrls {
  const env = readEnv();
  return {
    identity: env.VITE_IDENTITY_URL ?? "http://localhost:3001",
    patient: env.VITE_PATIENT_URL ?? "http://localhost:3002",
    scheduling: env.VITE_SCHEDULING_URL ?? "http://localhost:3003",
    treatment: env.VITE_TREATMENT_URL ?? "http://localhost:3004",
    finance: env.VITE_FINANCE_URL ?? "http://localhost:3005",
    crm: env.VITE_CRM_URL ?? "http://localhost:3006",
    ai: env.VITE_AI_URL ?? "http://localhost:3007",
  };
}
