/**
 * Cliente de API HTTP tipado (fetch), framework-agnostico.
 *
 * Usado pelos apps mobile (Expo/React Native) e por qualquer consumidor Node.
 * - Base URL por servico.
 * - Injeta o access token (Bearer) via provedor de token.
 * - Em 401, tenta renovar o token uma vez (callback opcional) e repete.
 * - Erros viram ApiError com status e codigo, sem vazar detalhes internos.
 *
 * Nao depende de React Native: usa o `fetch` global (disponivel no RN e no Node
 * 22) e permite injecao de `fetchImpl` para testes.
 */

export interface ApiErrorBody {
  readonly error?: { readonly code?: string; readonly message?: string };
}

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export interface ApiClientOptions {
  readonly baseUrl: string;
  /** Retorna o access token atual, ou null se nao autenticado. */
  readonly getAccessToken: () => string | null;
  /** Tenta renovar o token; retorna o novo token ou null. Opcional. */
  readonly refresh?: () => Promise<string | null>;
  /** Injecao de fetch para testes. Padrao: fetch global. */
  readonly fetchImpl?: typeof fetch;
}

export interface RequestOptions {
  readonly method?: "GET" | "POST" | "PATCH" | "PUT" | "DELETE";
  readonly body?: unknown;
  /** Rota nao exige autenticacao (ex.: login). */
  readonly public?: boolean;
}

export class ApiClient {
  private readonly fetchImpl: typeof fetch;

  constructor(private readonly opts: ApiClientOptions) {
    this.fetchImpl = opts.fetchImpl ?? fetch;
  }

  async request<T>(path: string, options: RequestOptions = {}): Promise<T> {
    const doFetch = async (token: string | null): Promise<Response> => {
      const headers: Record<string, string> = { "content-type": "application/json" };
      if (!options.public && token) {
        headers["authorization"] = `Bearer ${token}`;
      }
      const init: RequestInit = { method: options.method ?? "GET", headers };
      if (options.body !== undefined) {
        init.body = JSON.stringify(options.body);
      }
      return this.fetchImpl(`${this.opts.baseUrl}${path}`, init);
    };

    let response = await doFetch(options.public ? null : this.opts.getAccessToken());

    // Renova o token uma vez em 401 (rota autenticada).
    if (response.status === 401 && !options.public && this.opts.refresh) {
      const newToken = await this.opts.refresh();
      if (newToken) {
        response = await doFetch(newToken);
      }
    }

    if (!response.ok) {
      let code = "HTTP_ERROR";
      let message = `Erro ${response.status}`;
      try {
        const parsed = (await response.json()) as ApiErrorBody;
        if (parsed.error?.code) code = parsed.error.code;
        if (parsed.error?.message) message = parsed.error.message;
      } catch {
        // corpo nao-JSON: mantem mensagem padrao
      }
      throw new ApiError(response.status, code, message);
    }

    if (response.status === 204) {
      return undefined as T;
    }
    return (await response.json()) as T;
  }
}
