/**
 * Contexto de autenticacao do app do paciente.
 *
 * Carrega a sessao do SecureStore no boot, expõe login/logout e um ApiClient
 * factory ligado a sessao atual (com refresh automatico em 401). O
 * armazenamento e assincrono (mobile), por isso ha um estado de carregamento.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { ApiClient, AuthApi, SessionStore, type Session } from "@dentalprime/mobile-core";

import { getServiceUrls } from "./config";
import { secureStorage } from "./storage";

export interface AuthContextValue {
  readonly session: Session | null;
  readonly loading: boolean;
  readonly isAuthenticated: boolean;
  login(tenantId: string, email: string, password: string): Promise<void>;
  logout(): Promise<void>;
  clientFor(baseUrl: string): ApiClient;
}

const AuthContext = createContext<AuthContextValue | null>(null);

const store = new SessionStore(secureStorage);

export function AuthProvider({
  children,
}: {
  readonly children: ReactNode;
}): JSX.Element {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const sessionRef = useRef<Session | null>(null);
  sessionRef.current = session;

  useEffect(() => {
    let active = true;
    void store.load().then((loaded) => {
      if (active) {
        setSession(loaded);
        setLoading(false);
      }
    });
    return () => {
      active = false;
    };
  }, []);

  const urls = useMemo(() => getServiceUrls(), []);
  const authApi = useMemo(
    () =>
      new AuthApi(new ApiClient({ baseUrl: urls.identity, getAccessToken: () => null })),
    [urls.identity],
  );

  const login = useCallback(
    async (tenantId: string, email: string, password: string): Promise<void> => {
      const pair = await authApi.login(tenantId, email, password);
      const next: Session = { tenantId, email, ...pair };
      await store.save(next);
      setSession(next);
    },
    [authApi],
  );

  const logout = useCallback(async (): Promise<void> => {
    const current = sessionRef.current;
    if (current) {
      try {
        await authApi.logout(current.tenantId, current.refreshToken);
      } catch {
        // Falha remota nao impede encerrar a sessao local.
      }
    }
    await store.clear();
    setSession(null);
  }, [authApi]);

  const refresh = useCallback(async (): Promise<string | null> => {
    const current = sessionRef.current;
    if (!current) return null;
    try {
      const pair = await authApi.refresh(current.tenantId, current.refreshToken);
      const next: Session = { ...current, ...pair };
      await store.save(next);
      setSession(next);
      return next.accessToken;
    } catch {
      await store.clear();
      setSession(null);
      return null;
    }
  }, [authApi]);

  const clientFor = useCallback(
    (baseUrl: string): ApiClient =>
      new ApiClient({
        baseUrl,
        getAccessToken: () => sessionRef.current?.accessToken ?? null,
        refresh,
      }),
    [refresh],
  );

  const value = useMemo<AuthContextValue>(
    () => ({
      session,
      loading,
      isAuthenticated: session !== null,
      login,
      logout,
      clientFor,
    }),
    [session, loading, login, logout, clientFor],
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
