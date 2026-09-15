/**
 * Configuracao do frontend, lida das variaveis de ambiente do Vite (prefixo
 * VITE_). Nunca conter segredos: o bundle do frontend e publico.
 */

interface ImportMetaEnvLike {
  readonly VITE_API_BASE_URL?: string;
  readonly VITE_IDENTITY_URL?: string;
  readonly VITE_PATIENT_URL?: string;
  readonly VITE_SCHEDULING_URL?: string;
  readonly VITE_TREATMENT_URL?: string;
  readonly VITE_FINANCE_URL?: string;
  readonly VITE_CRM_URL?: string;
  readonly VITE_AI_URL?: string;
}

const PUBLIC_PATHS: ServiceUrls = {
  identity: "/api/identity",
  patient: "/api/patients",
  scheduling: "/api/scheduling",
  treatment: "/api/treatment",
  finance: "/api/finance",
  crm: "/api/crm",
  ai: "/api/ai",
};

function joinBaseUrl(baseUrl: string, path: string): string {
  return `${baseUrl.replace(/\/$/, "")}${path}`;
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
  const apiBaseUrl = env.VITE_API_BASE_URL?.trim();
  const publicUrl = (path: string): string =>
    apiBaseUrl ? joinBaseUrl(apiBaseUrl, path) : path;

  return {
    identity: env.VITE_IDENTITY_URL ?? publicUrl(PUBLIC_PATHS.identity),
    patient: env.VITE_PATIENT_URL ?? publicUrl(PUBLIC_PATHS.patient),
    scheduling: env.VITE_SCHEDULING_URL ?? publicUrl(PUBLIC_PATHS.scheduling),
    treatment: env.VITE_TREATMENT_URL ?? publicUrl(PUBLIC_PATHS.treatment),
    finance: env.VITE_FINANCE_URL ?? publicUrl(PUBLIC_PATHS.finance),
    crm: env.VITE_CRM_URL ?? publicUrl(PUBLIC_PATHS.crm),
    ai: env.VITE_AI_URL ?? publicUrl(PUBLIC_PATHS.ai),
  };
}
