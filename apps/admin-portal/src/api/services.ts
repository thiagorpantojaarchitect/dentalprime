/**
 * Modulos de API do admin-portal sobre o ApiClient. O portal consome apenas o
 * identity-access: autenticacao e gestao de rede (tenants, unidades, usuarios).
 */

import { ApiClient } from "./client.js";
import type {
  ClinicUnit,
  NetworkUser,
  ProvisionedTenant,
  Tenant,
  TokenPair,
} from "./types.js";

/** API de autenticacao (identity-access). */
export class AuthApi {
  constructor(private readonly client: ApiClient) {}

  async login(tenantId: string, email: string, password: string): Promise<TokenPair> {
    return this.client.request<TokenPair>("/auth/login", {
      method: "POST",
      body: { tenantId, email, password },
      public: true,
    });
  }

  async refresh(tenantId: string, refreshToken: string): Promise<TokenPair> {
    return this.client.request<TokenPair>("/auth/refresh", {
      method: "POST",
      body: { tenantId, refreshToken },
      public: true,
    });
  }

  async logout(tenantId: string, refreshToken: string): Promise<void> {
    await this.client.request<void>("/auth/logout", {
      method: "POST",
      body: { tenantId, refreshToken },
      public: true,
    });
  }
}

/** API de gestao de rede (identity-access): tenants, unidades e usuarios. */
export class NetworkApi {
  constructor(private readonly client: ApiClient) {}

  async currentTenant(): Promise<Tenant> {
    return this.client.request<Tenant>("/tenants/current");
  }

  async listTenants(): Promise<readonly Tenant[]> {
    const res = await this.client.request<{ tenants: Tenant[] }>("/tenants");
    return res.tenants;
  }

  async provisionTenant(input: {
    name: string;
    ownerEmail: string;
    ownerName: string;
  }): Promise<ProvisionedTenant> {
    return this.client.request<ProvisionedTenant>("/tenants", {
      method: "POST",
      body: input,
    });
  }

  async listUnits(): Promise<readonly ClinicUnit[]> {
    const res = await this.client.request<{ units: ClinicUnit[] }>("/units");
    return res.units;
  }

  async createUnit(name: string): Promise<ClinicUnit> {
    return this.client.request<ClinicUnit>("/units", {
      method: "POST",
      body: { name },
    });
  }

  async deactivateUnit(unitId: string): Promise<void> {
    await this.client.request<void>(`/units/${unitId}/deactivate`, { method: "POST" });
  }

  async listUsers(): Promise<readonly NetworkUser[]> {
    const res = await this.client.request<{ users: NetworkUser[] }>("/users");
    return res.users;
  }
}
