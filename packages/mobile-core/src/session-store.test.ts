import { describe, it, expect, beforeEach } from "vitest";

import { SessionStore, type Session, type StorageAdapter } from "./session-store.js";

class MemoryAdapter implements StorageAdapter {
  private readonly map = new Map<string, string>();
  async getItem(key: string): Promise<string | null> {
    return this.map.get(key) ?? null;
  }
  async setItem(key: string, value: string): Promise<void> {
    this.map.set(key, value);
  }
  async removeItem(key: string): Promise<void> {
    this.map.delete(key);
  }
}

const sample: Session = {
  tenantId: "clinic-1",
  email: "paciente@example.com",
  accessToken: "a.b.c",
  refreshToken: "r.e.f",
};

describe("SessionStore (mobile)", () => {
  let adapter: MemoryAdapter;
  let store: SessionStore;

  beforeEach(() => {
    adapter = new MemoryAdapter();
    store = new SessionStore(adapter);
  });

  it("retorna null quando nao ha sessao", async () => {
    expect(await store.load()).toBeNull();
  });

  it("faz round-trip de save e load", async () => {
    await store.save(sample);
    expect(await store.load()).toEqual(sample);
  });

  it("clear remove a sessao", async () => {
    await store.save(sample);
    await store.clear();
    expect(await store.load()).toBeNull();
  });

  it("retorna null para JSON invalido", async () => {
    await adapter.setItem("dentalprime.session", "{ nao é json");
    expect(await store.load()).toBeNull();
  });

  it("retorna null quando o shape esta incompleto", async () => {
    await adapter.setItem(
      "dentalprime.session",
      JSON.stringify({ tenantId: "x", email: "y" }),
    );
    expect(await store.load()).toBeNull();
  });
});
