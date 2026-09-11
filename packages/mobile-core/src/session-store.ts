/**
 * Armazenamento de sessao para apps mobile.
 *
 * Ao contrario do web (localStorage sincrono), o armazenamento nativo e
 * assincrono. Definimos um StorageAdapter assincrono que os apps implementam
 * com Expo SecureStore (recomendado para tokens) ou AsyncStorage. Nenhum
 * segredo de servidor vive aqui; guardamos apenas os tokens do usuario e o
 * tenant/email para exibicao.
 */

export interface Session {
  readonly tenantId: string;
  readonly email: string;
  readonly accessToken: string;
  readonly refreshToken: string;
}

/** Armazenamento chave-valor assincrono (SecureStore/AsyncStorage). */
export interface StorageAdapter {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
}

const STORAGE_KEY = "dentalprime.session";

export class SessionStore {
  constructor(private readonly storage: StorageAdapter) {}

  async load(): Promise<Session | null> {
    const raw = await this.storage.getItem(STORAGE_KEY);
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

  async save(session: Session): Promise<void> {
    await this.storage.setItem(STORAGE_KEY, JSON.stringify(session));
  }

  async clear(): Promise<void> {
    await this.storage.removeItem(STORAGE_KEY);
  }
}
