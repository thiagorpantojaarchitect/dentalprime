/**
 * Utilitarios de teste compartilhados pelas telas: storage em memoria, mock de
 * fetch e montagem do AuthProvider com sessao semeada e roteador.
 */

import type { ReactNode } from "react";
import { render } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";

import { AuthProvider } from "../auth/auth-context.js";
import {
  SessionStore,
  type Session,
  type SessionStorageLike,
} from "../auth/session-store.js";

export class MemoryStorage implements SessionStorageLike {
  private readonly map = new Map<string, string>();
  constructor(seed?: Session) {
    if (seed) this.map.set("dentalprime.session", JSON.stringify(seed));
  }
  getItem(key: string): string | null {
    return this.map.get(key) ?? null;
  }
  setItem(key: string, value: string): void {
    this.map.set(key, value);
  }
  removeItem(key: string): void {
    this.map.delete(key);
  }
}

export const seededSession: Session = {
  tenantId: "clinic-1",
  email: "user@example.com",
  accessToken: "acc",
  refreshToken: "ref",
};

/** Cria uma Response JSON para mocks de fetch. */
export function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

/**
 * Sequenciador de respostas: retorna, em ordem, cada resposta configurada.
 * Util para telas que fazem multiplas chamadas.
 */
export function sequencedFetch(
  responses: ReadonlyArray<Response | (() => Response)>,
): typeof fetch {
  let i = 0;
  const fn = async (): Promise<Response> => {
    const next = responses[Math.min(i, responses.length - 1)];
    i += 1;
    return typeof next === "function" ? next() : (next as Response);
  };
  return fn as unknown as typeof fetch;
}

/** Monta uma tela autenticada dentro de um roteador de memoria. */
export function renderAuthed(
  ui: ReactNode,
  options: {
    readonly fetchImpl: typeof fetch;
    readonly path?: string;
    readonly initialEntries?: readonly string[];
  },
): void {
  const store = new SessionStore(new MemoryStorage(seededSession));
  render(
    <AuthProvider identityUrl="http://id" store={store} fetchImpl={options.fetchImpl}>
      <MemoryRouter initialEntries={[...(options.initialEntries ?? ["/"])]}>
        <Routes>
          <Route path={options.path ?? "/"} element={ui} />
        </Routes>
      </MemoryRouter>
    </AuthProvider>,
  );
}
