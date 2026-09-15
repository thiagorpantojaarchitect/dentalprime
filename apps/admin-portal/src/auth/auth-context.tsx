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
  activate(tenantId: string, activationToken: string, password: string): Promise<void>;
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
  // Um refresh token e rotativo: requisicoes 401 concorrentes devem compartilhar
  // exatamente a mesma renovacao para nao invalidarem umas as outras.
  const refreshPromiseRef = useRef<Promise<string | null> | null>(null);
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
      sessionRef.current = next;
      setSession(next);
    },
    [authApi, store],
  );

  const activate = useCallback(
    async (tenantId: string, activationToken: string, password: string): Promise<void> =>
      authApi.activate(tenantId, activationToken, password),
    [authApi],
  );

  const logout = useCallback(async (): Promise<void> => {
    const current = sessionRef.current;
    sessionRef.current = null;
    store.clear();
    setSession(null);
    if (current) {
      try {
        await authApi.logout(current.tenantId, current.refreshToken);
      } catch {
        // Falha no logout remoto nao impede encerrar a sessao local.
      }
    }
  }, [authApi, store]);

  const refresh = useCallback((): Promise<string | null> => {
    if (refreshPromiseRef.current) return refreshPromiseRef.current;

    const current = sessionRef.current;
    if (!current) return Promise.resolve(null);

    const inFlight = (async (): Promise<string | null> => {
      try {
        const pair = await authApi.refresh(current.tenantId, current.refreshToken);
        // Logout, novo login ou outra troca de sessao durante a chamada vence.
        if (sessionRef.current?.refreshToken !== current.refreshToken) return null;
        const next: Session = { ...current, ...pair };
        store.save(next);
        sessionRef.current = next;
        setSession(next);
        return next.accessToken;
      } catch {
        if (sessionRef.current?.refreshToken === current.refreshToken) {
          store.clear();
          sessionRef.current = null;
          setSession(null);
        }
        return null;
      }
    })();

    refreshPromiseRef.current = inFlight;
    void inFlight.finally(() => {
      if (refreshPromiseRef.current === inFlight) refreshPromiseRef.current = null;
    });
    return inFlight;
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
    () => ({
      session,
      isAuthenticated: session !== null,
      login,
      activate,
      logout,
      clientFor,
    }),
    [session, login, activate, logout, clientFor],
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
