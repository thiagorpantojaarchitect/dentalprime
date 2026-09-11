/**
 * Hook que monta os modulos de API por dominio, ligados a sessao atual e as
 * URLs de servico da configuracao.
 */

import { useMemo } from "react";

import { useAuth } from "../auth/auth-context.js";
import { getServiceUrls } from "../config.js";
import {
  AiFrontDeskApi,
  CrmApi,
  FinanceApi,
  PatientApi,
  SchedulingApi,
  TreatmentApi,
  UserApi,
} from "./services.js";

export interface Services {
  readonly patients: PatientApi;
  readonly scheduling: SchedulingApi;
  readonly treatment: TreatmentApi;
  readonly finance: FinanceApi;
  readonly crm: CrmApi;
  readonly ai: AiFrontDeskApi;
  readonly users: UserApi;
}

export function useServices(): Services {
  const { clientFor } = useAuth();
  return useMemo(() => {
    const urls = getServiceUrls();
    return {
      patients: new PatientApi(clientFor(urls.patient)),
      scheduling: new SchedulingApi(clientFor(urls.scheduling)),
      treatment: new TreatmentApi(clientFor(urls.treatment)),
      finance: new FinanceApi(clientFor(urls.finance)),
      crm: new CrmApi(clientFor(urls.crm)),
      ai: new AiFrontDeskApi(clientFor(urls.ai)),
      users: new UserApi(clientFor(urls.identity)),
    };
  }, [clientFor]);
}
