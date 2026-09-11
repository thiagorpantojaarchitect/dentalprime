/**
 * Configuracao do app do paciente, lida de expo-constants (app.json > extra).
 * Nunca conter segredos: o bundle do app e distribuido publicamente.
 */

import Constants from "expo-constants";

interface Extra {
  readonly identityUrl?: string;
  readonly patientUrl?: string;
  readonly schedulingUrl?: string;
}

function extra(): Extra {
  return (Constants.expoConfig?.extra ?? {}) as Extra;
}

export interface ServiceUrls {
  readonly identity: string;
  readonly patient: string;
  readonly scheduling: string;
}

export function getServiceUrls(): ServiceUrls {
  const e = extra();
  return {
    identity: e.identityUrl ?? "http://localhost:3001",
    patient: e.patientUrl ?? "http://localhost:3002",
    scheduling: e.schedulingUrl ?? "http://localhost:3003",
  };
}
