/**
 * Hook que monta os modulos de API, ligados a sessao atual e a URL do servico
 * de identidade. O admin-portal usa apenas o identity-access.
 */

import { useMemo } from "react";

import { useAuth } from "../auth/auth-context.js";
import { getServiceUrls } from "../config.js";
import { NetworkApi } from "./services.js";

export interface Services {
  readonly network: NetworkApi;
}

export function useServices(): Services {
  const { clientFor } = useAuth();
  return useMemo(() => {
    const urls = getServiceUrls();
    return {
      network: new NetworkApi(clientFor(urls.identity)),
    };
  }, [clientFor]);
}
