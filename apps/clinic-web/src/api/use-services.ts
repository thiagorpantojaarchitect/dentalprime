/**
 * Hook que monta os modulos de API por dominio, ligados a sessao atual e as
 * URLs de servico da configuracao.
 */

import { useMemo } from "react";

import { useAuth } from "../auth/auth-context.js";
import { getServiceUrls } from "../config.js";
import { PatientApi, SchedulingApi } from "./services.js";

export interface Services {
  readonly patients: PatientApi;
  readonly scheduling: SchedulingApi;
}

export function useServices(): Services {
  const { clientFor } = useAuth();
  return useMemo(() => {
    const urls = getServiceUrls();
    return {
      patients: new PatientApi(clientFor(urls.patient)),
      scheduling: new SchedulingApi(clientFor(urls.scheduling)),
    };
  }, [clientFor]);
}
