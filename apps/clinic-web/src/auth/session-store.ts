/**
 * Armazenamento de sessao no browser (localStorage).
 *
 * Guarda tokens e o tenant/email do usuario logado. O access token e mantido em
 * memoria e espelhado no storage para sobreviver a reload. Nota: para producao,
 * cookies httpOnly seriam mais seguros contra XSS; esta abordagem e a base do
 * MVP e pode evoluir. Nenhum segredo de servidor vive aqui.
 */

export interface Session {
  readonly tenantId: string;
  readonly email: string;
  readonly accessToken: string;
  readonly refreshToken: string;
}

const STORAGE_KEY = "dentalprime.session";

export interface SessionStorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export class SessionStore {
  constructor(private readonly storage: SessionStorageLike) {}

  load(): Session | null {
    const raw = this.storage.getItem(STORAGE_KEY);
    if (!raw) return null;
    try {
      const parsed = JSON.parse(raw) as Partial<Session>;
      if (
        typeof parsed.tenantId === "string" &&
        typeof parsed.email === "string" &&
        typeof parsed.accessToken === "string" &&
        typeof parsed.refreshToken === "string"
      ) {
        return parsed as Session;
      }
      return null;
    } catch {
      return null;
    }
  }

  save(session: Session): void {
    this.storage.setItem(STORAGE_KEY, JSON.stringify(session));
  }

  clear(): void {
    this.storage.removeItem(STORAGE_KEY);
  }
}
