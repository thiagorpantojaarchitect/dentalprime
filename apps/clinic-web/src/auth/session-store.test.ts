import { describe, it, expect, beforeEach } from "vitest";

import { SessionStore, type Session, type SessionStorageLike } from "./session-store.js";

class MemoryStorage implements SessionStorageLike {
  private readonly map = new Map<string, string>();
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

const sample: Session = {
  tenantId: "clinic-1",
  email: "user@example.com",
  accessToken: "a.b.c",
  refreshToken: "r.e.f",
};

describe("SessionStore", () => {
  let storage: MemoryStorage;
  let store: SessionStore;

  beforeEach(() => {
    storage = new MemoryStorage();
    store = new SessionStore(storage);
  });

  it("retorna null quando nao ha sessao salva", () => {
    expect(store.load()).toBeNull();
  });

  it("faz round-trip de save e load", () => {
    store.save(sample);
    expect(store.load()).toEqual(sample);
  });

  it("clear remove a sessao", () => {
    store.save(sample);
    store.clear();
    expect(store.load()).toBeNull();
  });

  it("retorna null para JSON invalido", () => {
    storage.setItem("dentalprime.session", "{ nao é json");
    expect(store.load()).toBeNull();
  });

  it("retorna null quando o shape esta incompleto", () => {
    storage.setItem("dentalprime.session", JSON.stringify({ tenantId: "x", email: "y" }));
    expect(store.load()).toBeNull();
  });
});
