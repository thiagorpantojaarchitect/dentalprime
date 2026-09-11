/**
 * Contexto de autenticacao do admin-portal.
 *
 * Mantem a sessao (tokens em memoria + storage), expõe login/logout e um
 * ApiClient factory que injeta o access token atual e renova via refresh quando
 * o backend responde 401.
 */

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";

import { ApiClient } from "../api/client.js";
import { AuthApi } from "../api/services.js";
import { SessionStore, type Session } from "./session-store.js";

export interface AuthContextValue {
  readonly session: Session | null;
  readonly isAuthenticated: boolean;
  login(tenantId: string, email: string, password: string): Promise<void>;
  logout(): Promise<void>;
  /** Cria um ApiClient para um servico, ligado a sessao atual. */
  clientFor(baseUrl: string): ApiClient;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export interface AuthProviderProps {
  readonly children: ReactNode;
  readonly identityUrl: string;
  readonly store: SessionStore;
  /** Injecao de fetch (testes). Padrao: fetch global. */
  readonly fetchImpl?: typeof fetch;
}

export function AuthProvider({
  children,
  identityUrl,
  store,
  fetchImpl,
}: AuthProviderProps): JSX.Element {
  const [session, setSession] = useState<Session | null>(() => store.load());
  // Ref para leitura sempre atual dentro dos callbacks do ApiClient.
  const sessionRef = useRef<Session | null>(session);
  sessionRef.current = session;

  const authApi = useMemo(
    () =>
      new AuthApi(
        new ApiClient({
          baseUrl: identityUrl,
          getAccessToken: () => null,
          ...(fetchImpl ? { fetchImpl } : {}),
        }),
      ),
    [identityUrl, fetchImpl],
  );

  const login = useCallback(
    async (tenantId: string, email: string, password: string): Promise<void> => {
      const pair = await authApi.login(tenantId, email, password);
      const next: Session = { tenantId, email, ...pair };
      store.save(next);
      setSession(next);
    },
    [authApi, store],
  );

  const logout = useCallback(async (): Promise<void> => {
    const current = sessionRef.current;
    if (current) {
      try {
        await authApi.logout(current.tenantId, current.refreshToken);
      } catch {
        // Falha no logout remoto nao impede encerrar a sessao local.
      }
    }
    store.clear();
    setSession(null);
  }, [authApi, store]);

  const refresh = useCallback(async (): Promise<string | null> => {
    const current = sessionRef.current;
    if (!current) return null;
    try {
      const pair = await authApi.refresh(current.tenantId, current.refreshToken);
      const next: Session = { ...current, ...pair };
      store.save(next);
      setSession(next);
      return next.accessToken;
    } catch {
      store.clear();
      setSession(null);
      return null;
    }
  }, [authApi, store]);

  const clientFor = useCallback(
    (baseUrl: string): ApiClient =>
      new ApiClient({
        baseUrl,
        getAccessToken: () => sessionRef.current?.accessToken ?? null,
        refresh,
        ...(fetchImpl ? { fetchImpl } : {}),
      }),
    [refresh, fetchImpl],
  );

  const value = useMemo<AuthContextValue>(
    () => ({ session, isAuthenticated: session !== null, login, logout, clientFor }),
    [session, login, logout, clientFor],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error("useAuth deve ser usado dentro de AuthProvider.");
  }
  return ctx;
}
